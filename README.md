解决了原插件ComfyUI-DD-Translation在Comfyui更新Node2.0后出现的飞线以及翻译显示问题。将压缩包下载并放置custom_nodes根目录下，然后删除原本的ComfyUI-DD-Translation插件（希望作者可以更新~）

原插件问题根源（Nodes 2.0 下飞线与菜单未翻译）：

插件仍在 Vue/Nodes 2.0 前端运行旧版 LiteGraph/DOM 补丁（菜单观察器、面板按钮、布局归一化等），这些逻辑会误改画布缩放/偏移或节点位置，导致长距离“飞线”。 菜单翻译依赖旧版 DOM 结构，Nodes 2.0 改成 Vue，原方案失效，反而可能干扰布局。 解决方案要点：

严格区分模式：Nodes 2.0（Vue）不再加载旧 LiteGraph/DOM 补丁（上下文菜单、按钮、布局归一化等），只保留翻译数据注入。 默认常开翻译，移除“附加翻译/官方实现”按钮，避免切换状态影响前端。 菜单翻译在 Nodes 2.0 的两级兜底： 优先使用 comfyAPI.i18n.addTranslations 注入菜单文案。 若前端无 i18n 接口，则用 MutationObserver 做“纯文本”替换（仅菜单文本，忽略画布），不触碰缩放/位置。 normalizeLayout 等可能改坐标的函数在 Vue 模式下直接 return，避免任何画布/节点位置改写。 旧版模式仍按原逻辑（LiteGraph）翻译节点/菜单；节点定义翻译继续在 beforeRegisterVueAppNodeDefs 里做深度翻译（名称、分类、输入输出、描述等）。
