ComfyUI-YF-Translation 安装与使用说明（简版）
1) 解压：将本文件夹 `ComfyUI-YF-Translation` 直接放到 `ComfyUI/custom_nodes/` 目录下，保持文件夹名称不变。
2) 重启：重启 ComfyUI（或至少刷新前端）以加载扩展。
3) 不混用旧版：如果此前安装过 `ComfyUI-DD-Translation`，请移除/禁用旧目录，避免混合加载。
4) Nodes 2.0 支持：本版本在 Nodes 2.0 下默认开启翻译，避免飞线；菜单翻译优先使用前端 i18n，不支持时自动降级为安全的文本替换。
5) 常见问题：若菜单仍有英文，可能是前端缺少 i18n 接口或新增文案未在词表中，反馈具体文案即可补充。
