import {
  LESSON_SCHEMA_VERSION,
  type Lesson,
} from '../../domain/lesson/lesson'

export const coreLesson = {
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
            '模型不会直接阅读整句话。Tokenizer 先把文本切成 6 个 Token，再为每个 Token 找到词表中的数字编号。',
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
              expression: '[batch, token] = [1, 6]',
              explanation: '1 表示一条输入，6 表示这条输入包含六个 Token。',
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
              '教学模型的隐藏维度是 8。真实小模型通常会使用更高维度，但查表和后续批量计算的逻辑相同。',
            tensorShape: {
              expression: '[batch, token, hidden] = [1, 6, 8]',
              explanation: '六个 Token 各自得到一条八维隐藏向量。',
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
            explanation:
              '教学轨迹使用稳定的正弦位置向量。真实模型也可能学习位置向量，但两种方式都要让每个位置获得可区分的顺序信号。',
            formula: {
              expression: 'X = E_token + E_position',
              symbols: [
                { symbol: 'E_token', meaning: '从词表查到的 Token 内容向量' },
                { symbol: 'E_position', meaning: '表示当前顺序的位置向量' },
                { symbol: 'X', meaning: '送入 Transformer Block 的隐藏向量' },
              ],
            },
            tensorShape: {
              expression: '[1, 6, 8] + [1, 6, 8] = [1, 6, 8]',
              explanation: '两个张量形状相同，逐个 Token、逐个维度相加，形状保持不变。',
            },
            pseudocode: [
              'positions = arange(token_count)',
              'hidden = token_vectors + position_embedding[positions]',
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
            '不同 Token 的数值可能整体偏高、偏低或分散程度不同。LayerNorm 会分别观察每个 Token 的 8 个维度，把它们拉回共同的中心和尺度，让后面的投影更稳定。',
          action: {
            traceStepId: 'step:layernorm',
            selectEntityId: 'operation:layernorm',
            cameraTargetId: 'operation:layernorm',
            twoDTargetId: 'operation:layernorm',
          },
          deepDive: {
            title: '深入理解：零均值与单位方差',
            explanation:
              '教学图先展示标准化结果。真实 LayerNorm 还会用训练得到的 γ 和 β 再做缩放与平移，因此模型仍能学习合适的数值范围。',
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
              expression: '[batch, token, hidden] = [1, 6, 8]',
              explanation: 'LayerNorm 只改变每个位置的数值分布，不改变张量形状。',
            },
            pseudocode: [
              'mean = hidden.mean(dim=hidden_dimension)',
              'variance = hidden.var(dim=hidden_dimension)',
              'normalized = (hidden - mean) / sqrt(variance + epsilon)',
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
              expression: 'Q = X̂W_Q，K = X̂W_K，V = X̂W_V',
              symbols: [
                { symbol: 'X̂', meaning: '经过 LayerNorm 的隐藏向量' },
                { symbol: 'W_Q / W_K / W_V', meaning: '训练得到的三组投影权重' },
              ],
            },
            tensorShape: {
              expression: '[batch, head, token, head_size] = [1, 2, 6, 4]',
              explanation: '八维隐藏空间被拆成两个 Head，每个 Head 使用四维子空间。',
            },
          },
        },
        {
          id: 'lesson-step:causal-mask',
          kicker: 'CAUSAL MASK',
          title: '不让当前位置偷看未来',
          plainExplanation:
            '预测下一个 Token 时，当前位置只能读取自己和已经出现的内容。因果掩码把未来位置挡住，防止训练和生成时泄题。',
          action: {
            traceStepId: 'step:causal-mask',
            selectEntityId: 'operation:attention',
            cameraTargetId: 'head:0',
            twoDTargetId: 'operation:attention',
          },
          deepDive: {
            title: '深入理解：下三角掩码',
            explanation:
              '矩阵第 i 行代表第 i 个查询。列号大于 i 的位置属于未来，在 Softmax 前会被设为负无穷。',
            formula: {
              expression: 'M(i, j) = 0（j ≤ i），否则为 −∞',
              symbols: [
                { symbol: 'i', meaning: '当前查询 Token 的位置' },
                { symbol: 'j', meaning: '被读取 Token 的位置' },
              ],
            },
            tensorShape: {
              expression: '[token, token] = [6, 6]',
              explanation: '六个查询位置分别对应六个可能被读取的位置。',
            },
          },
        },
        {
          id: 'lesson-step:attention-output',
          kicker: 'WEIGHTED SUM',
          title: '按相关程度收集上下文',
          plainExplanation:
            'Q 和 K 产生相关程度，Softmax 把它变成权重。每个位置再按这些权重混合 V，从过去的 Token 中取回真正需要的信息。',
          action: {
            traceStepId: 'step:attention-output',
            selectEntityId: 'operation:attention',
            cameraTargetId: 'operation:attention',
            twoDTargetId: 'operation:attention',
          },
          deepDive: {
            title: '深入理解：缩放点积注意力',
            explanation:
              '除以根号 d_k 可以避免维度增大时点积过大；Softmax 让每行权重的总和等于 1。',
            formula: {
              expression: 'Attention(Q, K, V) = softmax(QKᵀ / √d_k + M)V',
              symbols: [
                { symbol: 'QKᵀ', meaning: '查询与索引的相似度分数' },
                { symbol: 'd_k', meaning: '每个 Attention Head 的向量维度' },
                { symbol: 'M', meaning: '阻止读取未来位置的因果掩码' },
                { symbol: 'V', meaning: '按权重汇总的内容向量' },
              ],
            },
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
          plainExplanation:
            '模型取最后一个位置的隐藏状态，投影到整个词表。每个候选得到一个 Logit：分数越高，当前上下文越支持它。',
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
              expression: 'z = h_last W_vocab + b',
              symbols: [
                { symbol: 'h_last', meaning: '输入最后位置的隐藏状态' },
                { symbol: 'W_vocab', meaning: '从隐藏维度映射到词表的权重' },
                { symbol: 'z', meaning: '每个词表候选的 Logit' },
              ],
            },
            tensorShape: {
              expression: '[batch, vocabulary] = [1, 16]',
              explanation: '教学词表有十六个候选，因此产生十六个分数。',
            },
          },
        },
        {
          id: 'lesson-step:softmax',
          kicker: 'SOFTMAX',
          title: '把候选分数变成概率',
          plainExplanation:
            'Softmax 会放大相对优势，同时把所有候选压到 0 和 1 之间。最终整组概率之和恰好为 1。',
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
              expression: 'p_i = exp(z_i) / Σ_j exp(z_j)',
              symbols: [
                { symbol: 'z_i', meaning: '第 i 个候选的 Logit' },
                { symbol: 'p_i', meaning: '第 i 个候选的归一化概率' },
              ],
            },
            pseudocode: [
              'stable_logits = logits - max(logits)',
              'probabilities = exp(stable_logits) / sum(exp(stable_logits))',
            ],
          },
        },
        {
          id: 'lesson-step:sample',
          kicker: 'SAMPLING',
          title: '从概率中选出下一个 Token',
          plainExplanation:
            '最后一步按照候选概率选择结果。本教学轨迹选中了句号“.”，它会被接到输入末尾，模型随后可以继续预测。',
          action: {
            traceStepId: 'step:sample',
            selectEntityId: 'output-token:12',
            cameraTargetId: 'output-token:12',
            twoDTargetId: 'output-token:12',
          },
          deepDive: {
            title: '深入理解：采样不是永远取第一名',
            explanation:
              '贪心解码总选最高概率；随机采样则保留其他候选的机会。参数实验会在后续课程开放。',
            pseudocode: [
              'candidate = sample(probabilities, seed)',
              'output_text = input_text + candidate.token',
            ],
          },
        },
      ],
    },
  ],
} satisfies Lesson
