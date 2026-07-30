export const DISTILGPT2_LAYER_COUNT = 6

const embeddingOutputs = [
  {
    outputName: 'trace.embedding.token',
    tensorName: '/transformer/wte/Gather_output_0',
    stage: 'embedding',
    layerIndex: null,
  },
  {
    outputName: 'trace.embedding.position',
    tensorName: '/transformer/wpe/Gather_output_0',
    stage: 'embedding',
    layerIndex: null,
  },
  {
    outputName: 'trace.embedding.sum',
    tensorName: '/transformer/Add_output_0',
    branchTensorNames: {
      then_branch: '/transformer/Add_1_output_0',
    },
    stage: 'embedding',
    layerIndex: null,
  },
]

function createLayerOutputs(layerIndex) {
  const prefix = `/transformer/h.${layerIndex}`
  const outputPrefix = `trace.layer.${layerIndex}`

  return [
    ['layerNorm1', `${prefix}/ln_1/Add_1_output_0`, 'layer-norm'],
    ['query', `${prefix}/attn/Transpose_output_0`, 'qkv'],
    ['attentionScores', `${prefix}/attn/Div_output_0`, 'attention'],
    ['attentionMaskedScores', `${prefix}/attn/Add_1_output_0`, 'attention'],
    ['attentionWeights', `${prefix}/attn/Softmax_output_0`, 'attention'],
    ['attentionHeadOutput', `${prefix}/attn/MatMul_1_output_0`, 'attention'],
    ['attentionProjected', `${prefix}/attn/c_proj/Reshape_1_output_0`, 'attention'],
    ['attentionResidual', `${prefix}/Add_output_0`, 'residual'],
    ['layerNorm2', `${prefix}/ln_2/Add_1_output_0`, 'layer-norm'],
    ['mlpHidden', `${prefix}/mlp/c_fc/Reshape_1_output_0`, 'mlp'],
    ['mlpActivated', `${prefix}/mlp/act/Mul_3_output_0`, 'mlp'],
    ['mlpProjected', `${prefix}/mlp/c_proj/Reshape_1_output_0`, 'mlp'],
    ['blockOutput', `${prefix}/Add_1_output_0`, 'residual'],
  ].map(([name, tensorName, stage]) => ({
    outputName: `${outputPrefix}.${name}`,
    tensorName,
    stage,
    layerIndex,
  }))
}

export const DISTILGPT2_PROMOTED_OUTPUTS = Object.freeze([
  ...embeddingOutputs,
  ...Array.from({ length: DISTILGPT2_LAYER_COUNT }, (_, layerIndex) =>
    createLayerOutputs(layerIndex),
  ).flat(),
])

export const DISTILGPT2_EXISTING_TRACE_OUTPUTS = Object.freeze(
  Array.from({ length: DISTILGPT2_LAYER_COUNT }, (_, layerIndex) => [
    {
      outputName: `present.${layerIndex}.key`,
      stage: 'qkv',
      layerIndex,
      semanticName: 'key',
    },
    {
      outputName: `present.${layerIndex}.value`,
      stage: 'qkv',
      layerIndex,
      semanticName: 'value',
    },
  ]).flat(),
)
