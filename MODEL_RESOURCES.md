# 真实模型资源基线

WP-30 将第一版浏览器真实模型候选固定为英文 DistilGPT-2。此清单只批准技术探针使用；普通生成图尚未提供课程所需的可信中间状态，因此在 WP-31 完成前不得标记为“真实模型教学 Trace”。

## 固定来源

| 项目 | 固定值 |
| --- | --- |
| 浏览器转换仓库 | [`Xenova/distilgpt2`](https://huggingface.co/Xenova/distilgpt2/tree/a41c10485c18a64b6606729b6a082330cbd8f49e) |
| Revision | `a41c10485c18a64b6606729b6a082330cbd8f49e` |
| 上游模型 | [`distilbert/distilgpt2`](https://huggingface.co/distilbert/distilgpt2/tree/2290a62682d06624634c1f46a6ad5be0f47f38aa) |
| 上游 Revision | `2290a62682d06624634c1f46a6ad5be0f47f38aa` |
| 许可证 | Apache-2.0 |
| Transformers.js 参数 | `task: text-generation`、`dtype: q8`、`model_file_name: decoder_model_merged` |
| 输入上限 | 12 Token |

所有下载 URL 必须包含上表的 40 位 Revision，禁止使用会漂移的 `main`、分支名或未固定标签。

## 浏览器下载清单

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `config.json` | 987 | `0e0fb9cdeb3a605afc6ce8f1c9830a2d78c7ad2596e498acc66b4ab2338edf51` |
| `generation_config.json` | 124 | `fa12d604e4ab52705c56eb9394c5d6a451cee884607fc25a8cd3388fc775c2be` |
| `onnx/decoder_model_merged_quantized.onnx` | 84,911,479 | `dfd02dcbfccb31d289cac235f71cecad357030866fe7019f05a36b1c5692afba` |
| `tokenizer.json` | 2,107,653 | `cda20b8ca044949aa07ac4078420c80d1a57139d5f9f33700e46fb2d891e7c66` |
| `tokenizer_config.json` | 234 | `551e26ec611d8d0c8edc3ef72e518a38418cb71f40de1347dd486a595e1557d7` |
| **合计** | **87,020,477** | **87.02 MB / 82.99 MiB** |

小文件的字节数与 SHA-256 由固定 Revision 的实际响应测得；ONNX 字节数与 SHA-256 取自 Hugging Face 该 Revision 的 LFS 元数据。应用仓库不提交模型本体。

## 运行时兼容约束

当前依赖 `@huggingface/transformers@4.2.0` 对 Decoder-only 模型默认请求 `onnx/model_quantized.onnx`，该文件约 237MB，不符合产品预算。加载器必须显式传入 `model_file_name: 'decoder_model_merged'`，才会选择清单中的 84.9MB 合并图。后续 Worker、缓存和适配器测试都必须断言这一覆盖项。

`tokenizer.json` 已包含词表与 merge 规则，因此运行时不再单独请求 `vocab.json` 与 `merges.txt`。资源总量必须在用户确认对话框中显示为约 87MB；取消确认时不得产生任何模型网络请求。

## 教学正确性闸门

此转换图可作为文本生成候选，但当前清单明确记录 `instrumented: false` 与 `approved: false`。WP-31 必须验证指定层的 Q/K/V、Attention 权重或等价可复核摘要，以及与普通模型 Logits 的数值一致性。若插桩图无法维持约 100MB 下载目标，或只能输出最终 Logits，则不得进入真实模型 UI。

变更 Repo ID、Revision、文件名、字节数、哈希、许可证、加载参数或下载预算时，必须作为新的资源审查提交，不能就地依赖远端漂移。
