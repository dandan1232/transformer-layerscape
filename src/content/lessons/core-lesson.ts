import {
  LESSON_SCHEMA_VERSION,
  type Lesson,
} from '../../domain/lesson/lesson'
import type { ModelTrace } from '../../domain/trace/trace'
import { verticalSliceTrace } from '../traces/vertical-slice-trace'

export function createCoreLesson(trace: ModelTrace): Lesson {
  const tokenCount = trace.input.tokens.length
  const { hiddenSize, heads, vocabularySize } = trace.model
  const headSize = trace.tensors['tensor:q']?.shape.at(-1) ?? hiddenSize / heads
  const intermediateSize = trace.tensors['tensor:mlp-expanded']?.shape.at(-1) ?? hiddenSize * 4
  const hiddenShape = `[1, ${tokenCount}, ${hiddenSize}]`
  const headShape = `[1, ${heads}, ${tokenCount}, ${headSize}]`
  const isRealModel = trace.source === 'onnx'
  const layer = (trace.entities['operation:layernorm']?.layerIndex ?? 0) + 1
  const outputEntityId = `output-token:${trace.output.sampledTokenId}`
  const sampledToken = trace.output.sampledToken.trim() || '空白 Token'
  const { temperature, topK, topP, seed } = trace.output.defaultSampling

  return {
    schemaVersion: LESSON_SCHEMA_VERSION,
    id: 'lesson:next-token-core-v1',
    locale: 'zh-CN',
    title: '一次完整的下一个 Token 预测',
    description: '从文字切分开始，经过注意力计算，直到模型选出下一个 Token。',
    chapters: [
      {
        id: 'chapter:token',
        title: '输入与 Token',
        shortTitle: 'Token',
        summary: '文字如何变成模型能够计算的编号和向量。',
        steps: [
          {
            id: 'lesson-step:tokenize',
            kicker: 'TOKENIZATION',
            title: '把句子切成模型的词块',
            plainExplanation:
              `模型不会直接阅读整句话。Tokenizer 先把文本切成 ${tokenCount} 个 Token，再为每个 Token 找到词表中的数字编号。`,
            action: {
              traceStepId: 'step:tokenize',
              selectEntityId: 'operation:tokenize',
              cameraTargetId: 'operation:tokenize',
              twoDTargetId: 'operation:tokenize',
            },
            deepDive: {
              title: '深入理解：Token ID',
              explanation:
                'Token ID 只是词表位置，不代表大小或语义距离。不同模型使用不同词表，同一段文字可能得到不同切分。',
              tensorShape: {
                expression: `[batch, token] = [1, ${tokenCount}]`,
                explanation: `1 表示一条输入，${tokenCount} 表示这条输入包含 ${tokenCount} 个 Token。`,
              },
              pseudocode: [
                'tokens = tokenizer.split(text)',
                'input_ids = vocabulary.lookup(tokens)',
              ],
            },
          },
          {
            id: 'lesson-step:embedding',
            kicker: 'TOKEN EMBEDDING',
            title: '把编号换成可以计算的向量',
            plainExplanation:
              '单个编号没有足够信息。模型会从 Embedding 表中查出一组数，让每个 Token 变成隐藏空间中的一个坐标。',
            action: {
              traceStepId: 'step:embedding',
              selectEntityId: 'operation:embedding',
              cameraTargetId: 'operation:embedding',
              twoDTargetId: 'operation:embedding',
            },
            deepDive: {
              title: '深入理解：Embedding 查表',
              explanation:
                `当前模型的隐藏维度是 ${hiddenSize}。每个 Token 都从同一张词嵌入表中查出向量，供后续批量计算使用。`,
              tensorShape: {
                expression: `[batch, token, hidden] = ${hiddenShape}`,
                explanation: `${tokenCount} 个 Token 各自得到一条 ${hiddenSize} 维隐藏向量。`,
              },
              pseudocode: ['token_vectors = embedding_table[input_ids]'],
            },
          },
          {
            id: 'lesson-step:position-embedding',
            kicker: 'POSITION EMBEDDING',
            title: '告诉模型每个 Token 排在第几位',
            plainExplanation:
              'Token 向量只说明“它是什么”，没有记录“它在哪里”。模型为第 1、2、3……个位置准备另一组向量，再与 Token 向量逐项相加。',
            action: {
              traceStepId: 'step:position-embedding',
              selectEntityId: 'operation:position-embedding',
              cameraTargetId: 'operation:position-embedding',
              twoDTargetId: 'operation:position-embedding',
            },
            deepDive: {
              title: '深入理解：内容与顺序逐项相加',
              explanation: isRealModel
                ? '当前真实模型的位置向量由训练得到。模型按位置查表，再与 Token 内容向量相加，为每个位置加入顺序信号。'
                : '当前预置案例使用正弦位置向量。位置不同，向量也不同，让模型获得可区分的顺序信号。',
              formula: {
                expression: 'X = E_token + E_position',
                symbols: [
                  { symbol: 'E_token', meaning: '从词表查到的 Token 内容向量' },
                  { symbol: 'E_position', meaning: '表示当前顺序的位置向量' },
                  { symbol: 'X', meaning: '送入 Transformer Block 的隐藏向量' },
                ],
              },
              tensorShape: {
                expression: `${hiddenShape} + ${hiddenShape} = ${hiddenShape}`,
                explanation: '两个张量形状相同，逐个 Token、逐个维度相加，形状保持不变。',
              },
              pseudocode: [
                'positions = arange(token_count)',
                isRealModel
                  ? 'hidden = token_vectors + position_embedding[positions]'
                  : 'hidden = token_vectors + sinusoidal_positions(positions)',
              ],
            },
          },
        ],
      },
      {
        id: 'chapter:attention',
        title: '注意力',
        shortTitle: 'Attention',
        summary: '每个位置如何寻找、衡量并收集上下文信息。',
        steps: [
          {
            id: 'lesson-step:layernorm',
            kicker: 'LAYER NORMALIZATION',
            title: '先把每个 Token 调到稳定尺度',
            plainExplanation:
              `不同 Token 的数值可能整体偏高、偏低或分散程度不同。LayerNorm 会分别观察每个 Token 的 ${hiddenSize} 个维度，先标准化，再交给后面的投影。${isRealModel ? `这里展示第 ${layer} 个 Block 的输入，${layer > 1 ? '已包含前面各层的计算结果' : '来自 Token 向量与位置向量之和'}。` : ''}`,
            action: {
              traceStepId: 'step:layernorm',
              selectEntityId: 'operation:layernorm',
              cameraTargetId: 'operation:layernorm',
              twoDTargetId: 'operation:layernorm',
            },
            deepDive: {
              title: '深入理解：零均值与单位方差',
              explanation: isRealModel
                ? '当前展示的是完整 LayerNorm 输出：标准化后，还会用训练得到的 γ 和 β 做缩放与平移，所以输出不一定是零均值、单位方差。'
                : '预置案例展示标准化结果。真实 LayerNorm 还会用训练得到的 γ 和 β 再做缩放与平移，因此模型仍能学习合适的数值范围。',
              formula: {
                expression: 'x̂ = (x − μ) / √(σ² + ε)，y = γx̂ + β',
                symbols: [
                  { symbol: 'μ', meaning: '当前 Token 各维度的平均值' },
                  { symbol: 'σ²', meaning: '当前 Token 各维度的方差' },
                  { symbol: 'ε', meaning: '避免除以零的微小常数' },
                  { symbol: 'γ / β', meaning: '训练得到的缩放与平移参数' },
                ],
              },
              tensorShape: {
                expression: `[batch, token, hidden] = ${hiddenShape}`,
                explanation: 'LayerNorm 只改变每个位置的数值分布，不改变张量形状。',
              },
              pseudocode: [
                'mean = hidden.mean(dim=hidden_dimension)',
                'variance = hidden.var(dim=hidden_dimension)',
                'normalized = (hidden - mean) / sqrt(variance + epsilon)',
                ...(isRealModel ? ['normalized = gamma * normalized + beta'] : []),
              ],
            },
          },
          {
            id: 'lesson-step:qkv',
            kicker: 'Q / K / V',
            title: '为信息准备三种角色',
            plainExplanation:
              '归一化后的同一个隐藏向量会经过三次不同投影：Q 表示“我在找什么”，K 表示“我有什么特征”，V 表示“我要贡献什么内容”。',
            action: {
              traceStepId: 'step:qkv',
              selectEntityId: 'operation:qkv',
              cameraTargetId: 'head:0',
              twoDTargetId: 'operation:qkv',
            },
            deepDive: {
              title: '深入理解：线性投影',
              explanation: '三个权重矩阵各自学习不同的观察方向，不是把归一化向量机械复制三份。',
              formula: {
                expression: isRealModel
                  ? 'Q = X̂W_Q + b_Q，K = X̂W_K + b_K，V = X̂W_V + b_V'
                  : 'Q = X̂W_Q，K = X̂W_K，V = X̂W_V',
                symbols: [
                  { symbol: 'X̂', meaning: '经过 LayerNorm 的隐藏向量' },
                  { symbol: 'W_Q / W_K / W_V', meaning: '训练得到的三组投影权重' },
                  ...(isRealModel ? [{ symbol: 'b_Q / b_K / b_V', meaning: '训练得到的三组偏置' }] : []),
                ],
              },
              tensorShape: {
                expression: `[batch, head, token, head_size] = ${headShape}`,
                explanation: `${hiddenSize} 维隐藏空间被拆成 ${heads} 个 Head，每个 Head 使用 ${headSize} 维子空间。`,
              },
            },
          },
          {
            id: 'lesson-step:causal-mask',
            kicker: 'CAUSAL MASK',
            title: '不让当前位置偷看未来',
            plainExplanation:
              `预测下一个 Token 时，当前位置只能读取自己和已经出现的内容。${heads} 个 Head 共用同一张因果掩码，但会在可见范围内形成不同的关注分布。`,
            action: {
              traceStepId: 'step:causal-mask',
              selectEntityId: 'operation:attention',
              cameraTargetId: 'head:0',
              twoDTargetId: 'operation:attention',
            },
            deepDive: {
              title: '深入理解：下三角掩码',
              explanation:
                '矩阵第 i 行代表第 i 个查询。列号大于 i 的位置属于未来，在 Softmax 前会被设为负无穷；Softmax 沿最后一个 Token 维度计算，让每个 Head 的每一行权重和为 1。',
              formula: {
                expression: 'M(i, j) = 0（j ≤ i），否则为 −∞',
                symbols: [
                  { symbol: 'i', meaning: '当前查询 Token 的位置' },
                  { symbol: 'j', meaning: '被读取 Token 的位置' },
                ],
              },
              tensorShape: {
                expression: `Mask [${tokenCount}, ${tokenCount}] → Weights [1, ${heads}, ${tokenCount}, ${tokenCount}]`,
                explanation: `一张下三角掩码广播到 ${heads} 个 Head，每个 Head 都产生 ${tokenCount} 行注意力权重。`,
              },
              pseudocode: [
                'scores = Q @ K.transpose(-1, -2) / sqrt(head_size)',
                'scores = scores.masked_fill(mask == 0, -infinity)',
                'weights = softmax(scores, dim=-1)',
              ],
            },
          },
          {
            id: 'lesson-step:attention-output',
            kicker: 'WEIGHTED SUM',
            title: `让 ${heads} 个 Head 分工再合并`,
            plainExplanation:
              `Q 和 K 产生相关程度，Softmax 把它变成权重。${heads} 个 Head 各自在 ${headSize} 维子空间中混合 V，再把结果拼回 ${hiddenSize} 维隐藏向量。${isRealModel ? '真实模型还会对拼接结果做一次输出投影。' : ''}`,
            action: {
              traceStepId: 'step:attention-output',
              selectEntityId: 'operation:attention',
              cameraTargetId: 'operation:attention',
              twoDTargetId: 'operation:attention',
            },
            deepDive: {
              title: '深入理解：缩放点积注意力',
              explanation:
                '除以根号 d_k 可以避免维度增大时点积过大；Softmax 让每行权重的总和等于 1。每个 Head 独立完成加权求和，最后沿隐藏维度拼接。',
              formula: {
                expression: 'Attention(Q, K, V) = softmax(QKᵀ / √d_k + M)V',
                symbols: [
                  { symbol: 'QKᵀ', meaning: '查询与索引的相似度分数' },
                  { symbol: 'd_k', meaning: '每个 Attention Head 的向量维度' },
                  { symbol: 'M', meaning: '阻止读取未来位置的因果掩码' },
                  { symbol: 'V', meaning: '按权重汇总的内容向量' },
                ],
              },
              tensorShape: {
                expression: `${headShape} → concat(head) → ${hiddenShape}${isRealModel ? ` → W_O → ${hiddenShape}` : ''}`,
                explanation: `${heads} 个 Head 各输出 ${headSize} 维向量，按 Head 顺序拼接后恢复 ${hiddenSize} 维隐藏空间。${isRealModel ? '输出投影保持隐藏维度不变。' : ''}`,
              },
              pseudocode: [
                'head_output = weights @ V',
                'attention_output = concat(head_output, dim=head)',
                ...(isRealModel ? ['attention_output = attention_output @ W_O + b_O'] : []),
              ],
            },
          },
        ],
      },
      {
        id: 'chapter:feed-forward',
        title: '残差与前馈网络',
        shortTitle: 'Residual + MLP',
        summary: '信息如何绕过子层、扩展维度，再安全回到主路。',
        steps: [
          {
            id: 'lesson-step:attention-residual',
            kicker: 'RESIDUAL CONNECTION',
            title: '给 Attention 留一条信息旁路',
            plainExplanation:
              `Attention 负责重组上下文，但原来的 Token 信息不应该被迫全部重建。残差连接让当前 Block 的输入 X 绕过 Attention，再与它的 ${hiddenSize} 维输出逐项相加。`,
            action: {
              traceStepId: 'step:attention-residual',
              selectEntityId: 'operation:residual-attention',
              cameraTargetId: 'operation:residual-attention',
              twoDTargetId: 'operation:residual-attention',
            },
            deepDive: {
              title: '深入理解：残差不是复制层',
              explanation:
                '旁路不增加新的可训练变换，只把子层输入直接带到加法节点。模型可以学习“在原信息上修改多少”，梯度也获得更短的传播路径。',
              formula: {
                expression: 'R_attn = X + Attention(LN(X))',
                symbols: [
                  { symbol: 'X', meaning: '进入 Attention 子层前的隐藏向量' },
                  { symbol: 'R_attn', meaning: 'Attention 残差相加后的隐藏向量' },
                ],
              },
              tensorShape: {
                expression: `${hiddenShape} + ${hiddenShape} = ${hiddenShape}`,
                explanation: '残差相加要求两个张量形状完全一致，因此不会改变隐藏维度。',
              },
              pseudocode: ['attention_residual = hidden + attention_output'],
            },
          },
          {
            id: 'lesson-step:mlp-layernorm',
            kicker: 'PRE-NORM ORDER',
            title: '先稳定主路，再进入 MLP',
            plainExplanation:
              '这条教学轨迹使用 Pre-Norm：Attention 残差完成后，第二次 LayerNorm 才处理主路，然后把稳定后的结果交给 MLP。',
            action: {
              traceStepId: 'step:mlp-layernorm',
              selectEntityId: 'operation:mlp-layernorm',
              cameraTargetId: 'operation:mlp-layernorm',
              twoDTargetId: 'operation:mlp-layernorm',
            },
            deepDive: {
              title: '深入理解：顺序决定残差公式',
              explanation:
                'Pre-Norm 把 LayerNorm 放在每个子层之前，残差主路本身保持直接。另一类 Post-Norm 会先完成子层和残差相加，再归一化；两者不能混写。',
              formula: {
                expression: 'U = LN(R_attn)，F = MLP(U)',
                symbols: [
                  { symbol: 'U', meaning: '送入 MLP 的归一化隐藏向量' },
                  { symbol: 'F', meaning: 'MLP 产生的特征变换' },
                ],
              },
              tensorShape: {
                expression: `${hiddenShape} → LN → ${hiddenShape}`,
                explanation: 'LayerNorm 只改变数值分布，不改变 Token 数或隐藏维度。',
              },
            },
          },
          {
            id: 'lesson-step:mlp',
            kicker: 'FEED-FORWARD MLP',
            title: '把每个 Token 放进更宽的工作区',
            plainExplanation:
              `Attention 在 Token 之间交换信息；MLP 则对每个 Token 独立使用同一组参数。它先把 ${hiddenSize} 维向量扩展到 ${intermediateSize} 维，让更多特征可以被组合，再用 GELU 筛选并压回 ${hiddenSize} 维。`,
            action: {
              traceStepId: 'step:mlp',
              selectEntityId: 'operation:mlp',
              cameraTargetId: 'operation:mlp',
              twoDTargetId: 'operation:mlp',
            },
            deepDive: {
              title: '深入理解：扩维、非线性、降维',
              explanation:
                '如果只有两次线性投影，它们仍可合并成一次线性变换。GELU 插在中间，引入非线性，让模型能够选择性保留和组合扩展空间中的特征。',
              formula: {
                expression: 'MLP(U) = GELU(UW_up + b_up)W_down + b_down',
                symbols: [
                  { symbol: 'W_up', meaning: `从 ${hiddenSize} 维投影到 ${intermediateSize} 维的权重` },
                  { symbol: 'GELU', meaning: '平滑筛选正负特征的非线性激活' },
                  { symbol: 'W_down', meaning: `从 ${intermediateSize} 维投影回 ${hiddenSize} 维的权重` },
                ],
              },
              tensorShape: {
                expression: `${hiddenShape} → [1, ${tokenCount}, ${intermediateSize}] → ${hiddenShape}`,
                explanation: `Token 数保持 ${tokenCount} 个，只有最后一个特征维度先扩展到 ${intermediateSize} 维再恢复。`,
              },
              pseudocode: [
                `expanded = linear_up(normalized)  # ${hiddenSize}D -> ${intermediateSize}D`,
                'activated = gelu(expanded)',
                `mlp_output = linear_down(activated)  # ${intermediateSize}D -> ${hiddenSize}D`,
              ],
            },
          },
          {
            id: 'lesson-step:mlp-residual',
            kicker: 'BLOCK OUTPUT',
            title: '把 MLP 的修改合回主路',
            plainExplanation:
              `MLP 输出回到 ${hiddenSize} 维后，与 Attention 残差逐项相加。这样一个 Transformer Block 同时完成了跨 Token 的信息交换和逐 Token 的特征加工。`,
            action: {
              traceStepId: 'step:mlp-residual',
              selectEntityId: 'operation:residual-mlp',
              cameraTargetId: 'operation:residual-mlp',
              twoDTargetId: 'operation:residual-mlp',
            },
            deepDive: {
              title: '深入理解：完整 Pre-Norm Block',
              explanation:
                `第二条残差继续保留 Attention 主路，同时叠加 MLP 学到的特征修正。输出仍是 ${hiddenSize} 维。${isRealModel ? `所选第 ${layer} 层之后的 Block（如有）仍会继续运行，最后经过最终 LayerNorm，才进入词表投影。` : '它可以继续送入下一个 Block，或进入输出阶段。'}`,
              formula: {
                expression: 'BlockOut = R_attn + MLP(LN(R_attn))',
                symbols: [
                  { symbol: 'R_attn', meaning: 'Attention 子层完成后的残差主路' },
                  { symbol: 'BlockOut', meaning: '完整 Transformer Block 的输出' },
                ],
              },
              tensorShape: {
                expression: `${hiddenShape} + ${hiddenShape} = ${hiddenShape}`,
                explanation: 'MLP 降回隐藏维度后才能与主路相加，形成当前 Block 的输出。',
              },
              pseudocode: ['block_output = attention_residual + mlp_output'],
            },
          },
        ],
      },
      {
        id: 'chapter:output',
        title: '输出与选择',
        shortTitle: 'Output',
        summary: '隐藏状态如何变成词表概率，并选出下一项。',
        steps: [
          {
            id: 'lesson-step:logits',
            kicker: 'LOGITS',
            title: '给词表里的每个候选打分',
            plainExplanation: isRealModel
              ? `所选第 ${layer} 层之后的 Block（如有）继续计算，再经过最终 LayerNorm。模型取最后一个位置的最终隐藏状态，投影到整个词表，得到 ${vocabularySize} 个 Logit。分数越高，当前上下文越支持它。`
              : `模型取最后一个位置的隐藏状态，投影到整个词表，得到 ${vocabularySize} 个 Logit。分数越高，当前上下文越支持它。`,
            action: {
              traceStepId: 'step:logits',
              selectEntityId: 'operation:output',
              cameraTargetId: 'operation:output',
              twoDTargetId: 'operation:output',
            },
            deepDive: {
              title: '深入理解：词表投影',
              explanation: 'Logit 可以是任意实数，还不是概率，不能直接解释成百分比。',
              formula: {
                expression: isRealModel ? 'z = h_final,last W_vocab' : 'z = h_last W_vocab + b',
                symbols: [
                  { symbol: isRealModel ? 'h_final,last' : 'h_last', meaning: isRealModel ? '所有 Block 和最终 LayerNorm 完成后，最后位置的隐藏状态' : '输入最后位置的隐藏状态' },
                  { symbol: 'W_vocab', meaning: '从隐藏维度映射到词表的权重' },
                  { symbol: 'z', meaning: '每个词表候选的 Logit' },
                ],
              },
              tensorShape: {
                expression: `[batch, vocabulary] = [1, ${vocabularySize}]`,
                explanation: `当前词表有 ${vocabularySize} 个候选，因此产生 ${vocabularySize} 个分数。`,
              },
            },
          },
          {
            id: 'lesson-step:softmax',
            kicker: 'SOFTMAX',
            title: '把候选分数变成概率',
            plainExplanation:
              'Temperature 会先调整分数差距，再由 Softmax 把所有候选压到 0 和 1 之间。温度越低，概率越集中；温度越高，选择越分散。',
            action: {
              traceStepId: 'step:softmax',
              selectEntityId: 'operation:output',
              cameraTargetId: 'operation:output',
              twoDTargetId: 'operation:output',
            },
            deepDive: {
              title: '深入理解：归一化概率',
              explanation:
                '先减去最大 Logit 可以提高数值稳定性，但不会改变 Softmax 的最终比例。',
              formula: {
                expression: 'p_i = exp(z_i / T) / Σ_j exp(z_j / T)',
                symbols: [
                  { symbol: 'z_i', meaning: '第 i 个候选的 Logit' },
                  { symbol: 'p_i', meaning: '第 i 个候选的归一化概率' },
                  { symbol: 'T', meaning: '控制概率集中程度的 Temperature' },
                ],
              },
              pseudocode: [
                'scaled_logits = logits / temperature',
                'stable_logits = scaled_logits - max(scaled_logits)',
                'probabilities = exp(stable_logits) / sum(exp(stable_logits))',
              ],
            },
          },
          {
            id: 'lesson-step:sample',
            kicker: 'SAMPLING',
            title: '从概率中选出下一个 Token',
            plainExplanation:
              `最后一步用 Top-k 和 Top-p 缩小候选范围，再按概率采样。本次轨迹默认参数为 Temperature ${temperature}、Top-k ${topK}、Top-p ${topP}、Seed ${seed}，结果是“${sampledToken}”。改变参数后的实验结果请看二维计算面板。`,
            action: {
              traceStepId: 'step:sample',
              selectEntityId: outputEntityId,
              cameraTargetId: outputEntityId,
              twoDTargetId: outputEntityId,
            },
            deepDive: {
              title: '深入理解：采样不是永远取第一名',
              explanation:
                'Top-k 控制候选数量，Top-p 控制候选覆盖的概率质量；Seed 固定随机数起点。相同 Logits、参数和 Seed 会得到相同结果，便于逐项比较。',
              pseudocode: [
                'candidates = top_p(top_k(probabilities, k), p)',
                'candidate = sample(candidates, seed)',
                'output_text = input_text + candidate.token',
              ],
            },
          },
        ],
      },
    ],
  }
}

export const coreLesson = createCoreLesson(verticalSliceTrace)
