import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const ANCHOR_BYTES = 32
const SEARCH_BYTES = 16_384

function usage() {
  throw new Error(
    'Usage: node scripts/model-tools/create-model-binary-patch.mjs <source> <target> <output.mjs>',
  )
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function keyAt(buffer, offset) {
  return buffer.subarray(offset, offset + ANCHOR_BYTES).toString('base64')
}

function anchorMatches(source, sourceOffset, target, targetOffset) {
  for (let index = 0; index < ANCHOR_BYTES; index += 1) {
    if (source[sourceOffset + index] !== target[targetOffset + index]) return false
  }
  return true
}

function findNextAnchor(source, target, sourceOffset, targetOffset) {
  const targetEnd = Math.min(target.length - ANCHOR_BYTES, targetOffset + SEARCH_BYTES)
  const targetAnchors = new Map()
  for (let offset = targetOffset; offset <= targetEnd; offset += 1) {
    const key = keyAt(target, offset)
    if (!targetAnchors.has(key)) targetAnchors.set(key, offset)
  }

  const sourceEnd = Math.min(source.length - ANCHOR_BYTES, sourceOffset + SEARCH_BYTES)
  let best = null
  for (let offset = sourceOffset; offset <= sourceEnd; offset += 1) {
    const targetMatch = targetAnchors.get(keyAt(source, offset))
    if (targetMatch === undefined || !anchorMatches(source, offset, target, targetMatch)) continue
    const distance = (offset - sourceOffset) + (targetMatch - targetOffset)
    if (!best || distance < best.distance) {
      best = { sourceOffset: offset, targetOffset: targetMatch, distance }
      if (distance === 0) break
    }
  }
  return best
}

function createOperations(source, target) {
  const operations = []
  let sourceOffset = 0
  let targetOffset = 0

  while (sourceOffset < source.length && targetOffset < target.length) {
    const equalStartSource = sourceOffset
    while (
      sourceOffset < source.length &&
      targetOffset < target.length &&
      source[sourceOffset] === target[targetOffset]
    ) {
      sourceOffset += 1
      targetOffset += 1
    }
    if (sourceOffset > equalStartSource) {
      operations.push({
        sourceOffset: equalStartSource,
        length: sourceOffset - equalStartSource,
      })
    }
    if (sourceOffset >= source.length || targetOffset >= target.length) break

    const anchor = findNextAnchor(source, target, sourceOffset, targetOffset)
    if (!anchor) {
      throw new Error(
        `Unable to resynchronize near source ${sourceOffset}, target ${targetOffset}`,
      )
    }
    if (anchor.targetOffset > targetOffset) {
      operations.push({
        dataBase64: target.subarray(targetOffset, anchor.targetOffset).toString('base64'),
      })
    }
    sourceOffset = anchor.sourceOffset
    targetOffset = anchor.targetOffset
  }

  if (targetOffset < target.length) {
    operations.push({ dataBase64: target.subarray(targetOffset).toString('base64') })
  }
  return operations
}

function applyOperations(source, operations, targetBytes) {
  const output = Buffer.allocUnsafe(targetBytes)
  let outputOffset = 0
  for (const operation of operations) {
    const chunk = 'dataBase64' in operation
      ? Buffer.from(operation.dataBase64, 'base64')
      : source.subarray(operation.sourceOffset, operation.sourceOffset + operation.length)
    chunk.copy(output, outputOffset)
    outputOffset += chunk.length
  }
  if (outputOffset !== targetBytes) {
    throw new Error(`Patch wrote ${outputOffset} bytes, expected ${targetBytes}`)
  }
  return output
}

function encodeOperations(operations) {
  const byteLength = operations.reduce((total, operation) => (
    total + ('dataBase64' in operation
      ? 5 + Buffer.from(operation.dataBase64, 'base64').length
      : 9)
  ), 0)
  const encoded = Buffer.allocUnsafe(byteLength)
  let offset = 0
  for (const operation of operations) {
    if ('dataBase64' in operation) {
      const data = Buffer.from(operation.dataBase64, 'base64')
      encoded.writeUInt8(1, offset)
      encoded.writeUInt32LE(data.length, offset + 1)
      data.copy(encoded, offset + 5)
      offset += 5 + data.length
    } else {
      encoded.writeUInt8(0, offset)
      encoded.writeUInt32LE(operation.sourceOffset, offset + 1)
      encoded.writeUInt32LE(operation.length, offset + 5)
      offset += 9
    }
  }
  return encoded
}

const args = process.argv.slice(2)
if (args.length !== 3) usage()
const [sourceArgument, targetArgument, outputArgument] = args
const source = readFileSync(resolve(sourceArgument))
const target = readFileSync(resolve(targetArgument))
const operations = createOperations(source, target)
const reconstructed = applyOperations(source, operations, target.length)
const targetSha256 = sha256(target)
if (sha256(reconstructed) !== targetSha256) {
  throw new Error('Generated patch did not reconstruct the target')
}

const encodedOperations = encodeOperations(operations)
const compressedOperations = gzipSync(encodedOperations, { level: 9 })
const patch = {
  version: 1,
  format: 'gzip-instructions-v1',
  source: { bytes: source.length, sha256: sha256(source) },
  target: { bytes: target.length, sha256: targetSha256 },
  operationCount: operations.length,
  dataBase64: compressedOperations.toString('base64'),
}
const moduleSource = [
  '// Generated by scripts/model-tools/create-model-binary-patch.mjs.',
  '// Do not edit by hand.',
  `export const DISTILGPT2_INSTRUMENTATION_PATCH = ${JSON.stringify(patch)}`,
  '',
].join('\n')
writeFileSync(resolve(outputArgument), moduleSource)

const insertedBytes = operations
  .filter((operation) => 'dataBase64' in operation)
  .reduce((total, operation) => total + Buffer.from(operation.dataBase64, 'base64').length, 0)
process.stdout.write(`${JSON.stringify({
  operationCount: operations.length,
  insertedBytes,
  instructionBytes: encodedOperations.length,
  compressedBytes: compressedOperations.length,
  moduleBytes: Buffer.byteLength(moduleSource),
  sourceSha256: patch.source.sha256,
  targetSha256,
}, null, 2)}\n`)
