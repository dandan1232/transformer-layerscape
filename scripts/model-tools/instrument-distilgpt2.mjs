import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DISTILGPT2_PROMOTED_OUTPUTS } from '../../src/platform/model-runtime/instrumentation-plan.mjs'

const EXPECTED_SOURCE_SHA256 =
  'dfd02dcbfccb31d289cac235f71cecad357030866fe7019f05a36b1c5692afba'
const BRANCH_NAMES = ['else_branch', 'then_branch']

function usage() {
  throw new Error(
    'Usage: node scripts/model-tools/instrument-distilgpt2.mjs <source.onnx> <instrumented.onnx>',
  )
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function loadOnnxSchema() {
  const require = createRequire(import.meta.url)
  const runtimeEntry = require.resolve('onnxruntime-web')
  const schemaPath = resolve(
    dirname(runtimeEntry),
    '../lib/onnxjs/ort-schema/protobuf/onnx.js',
  )
  return require(schemaPath).onnx
}

function cloneValueInfo(onnx, source, name) {
  return onnx.ValueInfoProto.create({
    name,
    type: source.type,
    docString: source.docString,
  })
}

function promoteBranchOutputs(onnx, branchName, branch, referenceValueInfo) {
  const availableValueInfo = new Map(
    [...branch.valueInfo, ...branch.output].map((valueInfo) => [valueInfo.name, valueInfo]),
  )
  const promotedNames = new Set()

  for (const output of DISTILGPT2_PROMOTED_OUTPUTS) {
    const tensorName = output.branchTensorNames?.[branchName] ?? output.tensorName
    const source = availableValueInfo.get(tensorName)
    if (!source) {
      throw new Error(`Branch ${branchName} is missing tensor ${tensorName}`)
    }
    const reference = referenceValueInfo.get(output.tensorName)
    if (!reference) throw new Error(`Missing reference type for ${output.tensorName}`)
    branch.output.push(cloneValueInfo(onnx, reference, tensorName))
    promotedNames.add(tensorName)
  }

  branch.valueInfo = branch.valueInfo.filter((valueInfo) => !promotedNames.has(valueInfo.name))
}

function instrumentModel(onnx, sourceBuffer) {
  const model = onnx.ModelProto.decode(sourceBuffer)
  const graph = model.graph
  const ifNodes = graph.node.filter((node) => node.opType === 'If')
  if (ifNodes.length !== 1) {
    throw new Error(`Expected one root If node, received ${ifNodes.length}`)
  }

  const ifNode = ifNodes[0]
  const branches = new Map(
    ifNode.attribute.filter((attribute) => attribute.g).map((attribute) => [attribute.name, attribute.g]),
  )
  const referenceBranch = branches.get(BRANCH_NAMES[0])
  if (!referenceBranch) throw new Error(`Missing ${BRANCH_NAMES[0]} graph`)
  const referenceValueInfo = new Map(
    [...referenceBranch.valueInfo, ...referenceBranch.output]
      .map((valueInfo) => [valueInfo.name, valueInfo]),
  )
  for (const branchName of BRANCH_NAMES) {
    const branch = branches.get(branchName)
    if (!branch) throw new Error(`Missing ${branchName} graph`)
    promoteBranchOutputs(onnx, branchName, branch, referenceValueInfo)
  }

  const rootOutputNames = new Set(graph.output.map((output) => output.name))
  for (const output of DISTILGPT2_PROMOTED_OUTPUTS) {
    if (rootOutputNames.has(output.outputName)) {
      throw new Error(`Output ${output.outputName} already exists`)
    }

    const source = branches.get(BRANCH_NAMES[0]).output.find(
      (valueInfo) => valueInfo.name === output.tensorName,
    )
    if (!source) throw new Error(`Unable to resolve promoted type for ${output.tensorName}`)

    ifNode.output.push(output.outputName)
    graph.output.push(cloneValueInfo(onnx, source, output.outputName))
  }

  model.metadataProps.push(
    onnx.StringStringEntryProto.create({
      key: 'transformer-layerscape.instrumentation',
      value: 'wp-31-additional-graph-outputs-v1',
    }),
  )

  const verificationError = onnx.ModelProto.verify(model)
  if (verificationError) throw new Error(`Instrumented model is invalid: ${verificationError}`)
  return onnx.ModelProto.encode(model).finish()
}

export function main(args) {
  if (args.length !== 2) usage()
  const [sourceArgument, targetArgument] = args
  const sourcePath = resolve(sourceArgument)
  const targetPath = resolve(targetArgument)
  if (sourcePath === targetPath) throw new Error('Source and target paths must differ')

  const sourceBuffer = readFileSync(sourcePath)
  const sourceSha256 = sha256(sourceBuffer)
  if (sourceSha256 !== EXPECTED_SOURCE_SHA256) {
    throw new Error(`Source SHA-256 mismatch: ${sourceSha256}`)
  }

  const onnx = loadOnnxSchema()
  const instrumentedBuffer = instrumentModel(onnx, sourceBuffer)
  writeFileSync(targetPath, instrumentedBuffer)

  const report = {
    sourcePath,
    sourceBytes: sourceBuffer.byteLength,
    sourceSha256,
    targetPath,
    targetBytes: instrumentedBuffer.byteLength,
    targetSha256: sha256(instrumentedBuffer),
    promotedOutputCount: DISTILGPT2_PROMOTED_OUTPUTS.length,
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

const isEntryPoint = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntryPoint) main(process.argv.slice(2))
