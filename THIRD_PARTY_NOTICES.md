# Third-Party Notices

Transformer LayerScape 自身使用 [MIT License](./LICENSE)。以下声明覆盖计划由用户主动下载、但不随本仓库分发的模型资源。

## DistilGPT-2

- 上游模型：[`distilbert/distilgpt2` 固定 Revision](https://huggingface.co/distilbert/distilgpt2/tree/2290a62682d06624634c1f46a6ad5be0f47f38aa)
- 浏览器转换：[`Xenova/distilgpt2` 固定 Revision](https://huggingface.co/Xenova/distilgpt2/tree/a41c10485c18a64b6606729b6a082330cbd8f49e)
- 许可证：[`Apache License 2.0`](https://www.apache.org/licenses/LICENSE-2.0)
- 用途：用户确认后在浏览器本地执行英文 next-token 推理与教学可视化；输入不会发送给模型服务。

上游模型卡声明 Apache-2.0。转换仓库指向该上游模型，但其仓库元数据没有另行声明许可证、也没有独立 `LICENSE` 文件；因此本项目按上游 Apache-2.0 条款记录来源，并且当前不再分发转换权重。若未来把插桩或转换后的模型文件纳入发布物，发布前必须同时复核衍生权重的许可链、保留所需 Notices，并随发布物提供 Apache-2.0 许可证文本。

模型可能继承训练数据中的偏见、有害内容和事实错误。真实模型输出只用于解释模型计算过程，不应被描述为可靠事实。
