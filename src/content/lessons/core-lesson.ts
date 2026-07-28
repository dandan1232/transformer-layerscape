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
            '预测下一个 Token 时，当前位置只能读取自己和已经出现的内容。两个 Head 共用同一张因果掩码，但会在可见范围内形成不同的关注分布。',
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
              expression: 'Mask [6, 6] → Weights [1, 2, 6, 6]',
              explanation: '一张下三角掩码广播到两个 Head，每个 Head 都产生六行注意力权重。',
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
          title: '让两个 Head 分工再合并',
          plainExplanation:
            'Q 和 K 产生相关程度，Softmax 把它变成权重。两个 Head 各自在四维子空间中混合 V，关注不同的过去位置，再把两份四维结果拼回八维隐藏向量。',
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
              expression: '[1, 2, 6, 4] → concat(head) → [1, 6, 8]',
              explanation: '两个 Head 各输出四维向量，按 Head 顺序拼接后恢复八维隐藏空间。',
            },
            pseudocode: [
              'head_output = weights @ V',
              'attention_output = concat(head_output, dim=head)',
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
            'Attention 负责重组上下文，但原来的 Token 信息不应该被迫全部重建。残差连接让输入 X 绕过 Attention，再与它的八维输出逐项相加。',
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
              expression: '[1, 6, 8] + [1, 6, 8] = [1, 6, 8]',
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
              expression: '[1, 6, 8] → LN → [1, 6, 8]',
              explanation: 'LayerNorm 只改变数值分布，不改变 Token 数或隐藏维度。',
            },
          },
        },
        {
          id: 'lesson-step:mlp',
          kicker: 'FEED-FORWARD MLP',
          title: '把每个 Token 放进更宽的工作区',
          plainExplanation:
            'Attention 在 Token 之间交换信息；MLP 则对每个 Token 独立使用同一组参数。它先把八维向量扩展到三十二维，让更多特征可以被组合，再用 GELU 筛选并压回八维。',
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
                { symbol: 'W_up', meaning: '从八维投影到三十二维的权重' },
                { symbol: 'GELU', meaning: '平滑筛选正负特征的非线性激活' },
                { symbol: 'W_down', meaning: '从三十二维投影回八维的权重' },
              ],
            },
            tensorShape: {
              expression: '[1, 6, 8] → [1, 6, 32] → [1, 6, 8]',
              explanation: 'Token 数保持六个，只有最后一个特征维度先扩展四倍再恢复。',
            },
            pseudocode: [
              'expanded = linear_up(normalized)  # 8D -> 32D',
              'activated = gelu(expanded)',
              'mlp_output = linear_down(activated)  # 32D -> 8D',
            ],
          },
        },
        {
          id: 'lesson-step:mlp-residual',
          kicker: 'BLOCK OUTPUT',
          title: '把 MLP 的修改合回主路',
          plainExplanation:
            'MLP 输出回到八维后，与 Attention 残差逐项相加。这样一个 Transformer Block 同时完成了跨 Token 的信息交换和逐 Token 的特征加工。',
          action: {
            traceStepId: 'step:mlp-residual',
            selectEntityId: 'operation:residual-mlp',
            cameraTargetId: 'operation:residual-mlp',
            twoDTargetId: 'operation:residual-mlp',
          },
          deepDive: {
            title: '深入理解：完整 Pre-Norm Block',
            explanation:
              '第二条残差继续保留 Attention 主路，同时叠加 MLP 学到的特征修正。最终形状仍是八维，因此可以继续堆叠下一个 Block 或进入词表投影。',
            formula: {
              expression: 'BlockOut = R_attn + MLP(LN(R_attn))',
              symbols: [
                { symbol: 'R_attn', meaning: 'Attention 子层完成后的残差主路' },
                { symbol: 'BlockOut', meaning: '完整 Transformer Block 的输出' },
              ],
            },
            tensorShape: {
              expression: '[1, 6, 8] + [1, 6, 8] = [1, 6, 8]',
              explanation: 'MLP 降回隐藏维度后才能与主路相加，并继续传给输出投影。',
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
