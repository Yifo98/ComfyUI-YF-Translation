import { app } from "../../../scripts/app.js";
import { $el } from "../../../scripts/ui.js";
import { applyMenuTranslation, observeFactory } from "./MenuTranslate.js";
import {
  containsChineseCharacters,
  isAlreadyTranslated,
  hasNativeTranslation,
  nativeTranslatedSettings,
  isTranslationEnabled,
  toggleTranslation,
  initConfig,
  error
} from "./utils.js";

export class TUtils {
  // 强制认为当前前端为 Vue Nodes 2.0，避免旧版 LiteGraph 补丁干扰
  static isVueNodesMode = true;
  static T = {
    Menu: {},
    Nodes: {},
    NodeCategory: {},
  };
  static async syncTranslation(OnFinished = () => {}) {
    try {
      if (!isTranslationEnabled()) {
        // 如果翻译被禁用，清空翻译数据并直接返回
        TUtils.T = {
          Menu: {},
          Nodes: {},
          NodeCategory: {},
        };
        OnFinished();
        return;
      }
      
      try {
        const response = await fetch("./agl/get_translation", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: `locale=zh-CN`
        });
        
        if (!response.ok) {
          throw new Error(`请求翻译数据失败: ${response.status} ${response.statusText}`);
        }
        
        const resp = await response.json();
        for (var key in TUtils.T) {
          if (key in resp) TUtils.T[key] = resp[key];
          else TUtils.T[key] = {};
        }
        
        const isComfyUIChineseNative = document.documentElement.lang === 'zh-CN';
        
        if (isComfyUIChineseNative) {
          const originalMenu = TUtils.T.Menu || {};
          TUtils.T.Menu = {};
          for (const key in originalMenu) {
            if (!nativeTranslatedSettings.includes(key) && 
                !nativeTranslatedSettings.includes(originalMenu[key]) &&
                !containsChineseCharacters(key)) {
              TUtils.T.Menu[key] = originalMenu[key];
            }
          }
        } else {
          // 将NodeCategory合并到Menu中 
          TUtils.T.Menu = Object.assign(TUtils.T.Menu || {}, TUtils.T.NodeCategory || {});
        }
        
        // 提取 Node 中 key 到 Menu
        for (let key in TUtils.T.Nodes) {
          let node = TUtils.T.Nodes[key];
          if(node && node["title"]) {
            TUtils.T.Menu = TUtils.T.Menu || {};
            TUtils.T.Menu[key] = node["title"] || key;
          }
        }
        
      } catch (e) {
        error("获取翻译数据失败:", e);
      }
      
      OnFinished();
    } catch (err) {
      error("同步翻译过程出错:", err);
      OnFinished();
    }
  }
  static enhandeDrawNodeWidgets() {
    try {
      if (TUtils.isVueNodesMode) return;
      let drawNodeWidgets = LGraphCanvas.prototype.drawNodeWidgets;
      LGraphCanvas.prototype.drawNodeWidgets = function (node, posY, ctx, active_widget) {
        if (!node.widgets || !node.widgets.length) {
          return 0;
        }
        const widgets = node.widgets.filter((w) => w.type === "slider");
        widgets.forEach((widget) => {
          widget._ori_label = widget.label;
          const fixed = widget.options.precision != null ? widget.options.precision : 3;
          widget.label = (widget.label || widget.name) + ": " + Number(widget.value).toFixed(fixed).toString();
        });
        let result;
        try {
          result = drawNodeWidgets.call(this, node, posY, ctx, active_widget);
        } finally {
          widgets.forEach((widget) => {
            widget.label = widget._ori_label;
            delete widget._ori_label;
          });
        }
        return result;
      };
    } catch (e) {
      error("增强节点小部件绘制失败:", e);
    }
  }  static applyNodeTypeTranslationEx(nodeName) {
    try {
      let nodesT = this.T.Nodes;
      var nodeType = LiteGraph.registered_node_types[nodeName];
      if (!nodeType) return;
      
      let class_type = nodeType.comfyClass ? nodeType.comfyClass : nodeType.type;
      if (nodesT.hasOwnProperty(class_type)) {
        if (!hasNativeTranslation(nodeType, 'title') && nodesT[class_type]["title"]) {
          nodeType.title = nodesT[class_type]["title"];
        }
      }
    } catch (e) {
      error(`为节点类型 ${nodeName} 应用翻译失败:`, e);
    }
  }  static applyVueNodeDisplayNameTranslation(nodeDef) {
    try {
      const nodesT = TUtils.T.Nodes;
      const class_type = nodeDef.name;
      if (nodesT.hasOwnProperty(class_type)) {
        if (!hasNativeTranslation(nodeDef, 'display_name') && nodesT[class_type]["title"]) {
          nodeDef.display_name = nodesT[class_type]["title"];
        }
      }
    } catch (e) {
      error(`为Vue节点 ${nodeDef?.name} 应用显示名称翻译失败:`, e);
    }
  }

  static applyVueNodeTranslation(nodeDef) {
    try {
      const catsT = TUtils.T.NodeCategory;
      if (!nodeDef.category) return;
      const catArr = nodeDef.category.split("/");
      nodeDef.category = catArr.map((cat) => catsT?.[cat] || cat).join("/");
    } catch (e) {
      error(`为Vue节点 ${nodeDef?.name} 应用翻译失败:`, e);
    }
  }
  static applyVueNodeDeepTranslation(nodeDef) {
    try {
      const nodesT = TUtils.T.Nodes;
      const catsT = TUtils.T.NodeCategory;
      const class_type = nodeDef?.name;
      if (!class_type || !nodesT[class_type]) return;
      const t = nodesT[class_type];

      if (t.title && !hasNativeTranslation(nodeDef, "display_name")) {
        nodeDef.display_name = t.title;
      }

      if (nodeDef.category) {
        const catArr = nodeDef.category.split("/");
        nodeDef.category = catArr.map((cat) => catsT?.[cat] || cat).join("/");
      }

      const translateInputGroup = (group) => {
        if (!group) return;
        Object.entries(group).forEach(([key, val]) => {
          if (!val) return;
          if (t.inputs?.[key]) {
            val.name = t.inputs[key];
          }
          if (val.tooltip && t.widgets?.[val.tooltip]) {
            val.tooltip = t.widgets[val.tooltip];
          }
        });
      };
      translateInputGroup(nodeDef.input?.required);
      translateInputGroup(nodeDef.input?.optional);

      if (Array.isArray(nodeDef.output_name) && t.outputs) {
        nodeDef.output_name = nodeDef.output_name.map((outName) => t.outputs[outName] || outName);
      }

      if (Array.isArray(nodeDef.widgets) && t.widgets) {
        nodeDef.widgets = nodeDef.widgets.map((w) => {
          if (w?.name && t.widgets[w.name]) {
            return { ...w, name: t.widgets[w.name] };
          }
          return w;
        });
      }

      if (t.description && !hasNativeTranslation(nodeDef, "description")) {
        nodeDef.description = t.description;
      }
    } catch (e) {
      error(`为Vue节点 ${nodeDef?.name} 应用完整翻译失败:`, e);
    }
  }
  static applyNodeTypeTranslation(app) {
    try {
      if (TUtils.isVueNodesMode) return;
      if (!isTranslationEnabled()) return;
      
      for (let nodeName in LiteGraph.registered_node_types) {
        this.applyNodeTypeTranslationEx(nodeName);
      }
    } catch (e) {
      error("应用节点类型翻译失败:", e);
    }
  }  static needsTranslation(item) {
    if (!item || !item.hasOwnProperty("name")) return false;
    
    if (isAlreadyTranslated(item.name, item.label)) {
      return false;
    }
    
    if (containsChineseCharacters(item.name)) {
      return false;
    }
    
    return true;
  }

  static safeApplyTranslation(item, translation) {
    if (this.needsTranslation(item) && translation) {
      // 保存原始名称
      if (!item._original_name) {
        item._original_name = item.name;
      }
      item.label = translation;
    }
  }

  // 新增：还原翻译方法
  static restoreOriginalTranslation(item) {
    if (item._original_name) {
      item.label = item._original_name;
      delete item._original_name;
    } else if (item.label && item.name) {
      // 如果没有保存原始名称，则使用name作为fallback
      item.label = item.name;
    }
  }
  static applyNodeTranslation(node) {
    try {
      if (TUtils.isVueNodesMode) return;
      // 基本验证
      if (!node) {
        error("applyNodeTranslation: 节点为空");
        return;
      }
      
      if (!node.constructor) {
        error("applyNodeTranslation: 节点构造函数为空");
        return;
      }

      let keys = ["inputs", "outputs", "widgets"];
      let nodesT = this.T.Nodes;
      let class_type = node.constructor.comfyClass ? node.constructor.comfyClass : node.constructor.type;
      
      if (!class_type) {
        error("applyNodeTranslation: 无法获取节点类型");
        return;
      }

      if (!isTranslationEnabled()) {
        // 如果翻译被禁用，还原所有翻译
        for (let key of keys) {
          if (!node.hasOwnProperty(key)) continue;
          if (!node[key] || !Array.isArray(node[key])) continue;
          node[key].forEach((item) => {
            // 只还原那些确实被我们翻译过的项目（有_original_name标记的）
            if (item._original_name) {
              this.restoreOriginalTranslation(item);
            }
          });
        }
        
        // 还原标题 - 只还原那些确实被我们翻译过的标题
        if (node._original_title && !node._dd_custom_title) {
          node.title = node._original_title;
          node.constructor.title = node._original_title;
          delete node._original_title;
        }
        return;      }
      
      if (!nodesT || !nodesT.hasOwnProperty(class_type)) return;
      
      var t = nodesT[class_type];
      if (!t) return;
      
      for (let key of keys) {
        if (!t.hasOwnProperty(key)) continue;
        if (!node.hasOwnProperty(key)) continue;
        if (!node[key] || !Array.isArray(node[key])) continue;
        
        node[key].forEach((item) => {
          if (!item || !item.name) return;
          if (item.name in t[key]) {
            // 检查是否有原生翻译（特殊处理：排除有_original_name的项）
            const hasNative = hasNativeTranslation(item, 'label') && !item._original_name;
            
            // 如果没有原生翻译，才应用我们的翻译
            if (!hasNative) {
              this.safeApplyTranslation(item, t[key][item.name]);
            }
          }
        });
      }
      
      if (t.hasOwnProperty("title")) {
        const isCustomizedTitle = node._dd_custom_title || 
          (node.title && node.title !== (node.constructor.comfyClass || node.constructor.type) && node.title !== t["title"]);
        
        if (!isCustomizedTitle && !hasNativeTranslation(node, 'title')) {
          // 保存原始标题
          if (!node._original_title) {
            node._original_title = node.constructor.comfyClass || node.constructor.type;
          }
          node.title = t["title"];
          node.constructor.title = t["title"];
        }
      }
        // 转换 widget 到 input 时需要刷新socket信息
      let addInput = node.addInput;
      node.addInput = function (name, type, extra_info) {
        var oldInputs = [];
        if (this.inputs && Array.isArray(this.inputs)) {
          this.inputs.forEach((i) => oldInputs.push(i.name));
        }
        var res = addInput.apply(this, arguments);
        if (this.inputs && Array.isArray(this.inputs)) {
          this.inputs.forEach((i) => {
            if (oldInputs.includes(i.name)) return;
            if (t["widgets"] && i.widget?.name in t["widgets"]) {
              TUtils.safeApplyTranslation(i, t["widgets"][i.widget?.name]);
            }
          });
        }
        return res;
      };
        let onInputAdded = node.onInputAdded;
      node.onInputAdded = function (slot) {
        let res;
        if (onInputAdded) {
          res = onInputAdded.apply(this, arguments);
        }
        let t = TUtils.T.Nodes[this.comfyClass];
        if (t?.["widgets"] && slot.name in t["widgets"]) {
          if (TUtils.needsTranslation(slot)) {
            slot.localized_name = t["widgets"][slot.name];
          }
        }
        return res;
      };
    } catch (e) {
      error(`为节点 ${node?.title || '未知'} 应用翻译失败:`, e);
    }
  }
  static applyNodeDescTranslation(nodeType, nodeData, app) {
    try {
      if (TUtils.isVueNodesMode) return;
      // 如果翻译被禁用，直接返回
      if (!isTranslationEnabled()) {
        return;
      }
      
      let nodesT = this.T.Nodes;
      var t = nodesT[nodeType.comfyClass];
      if (t?.["description"]) {
        nodeData.description = t["description"];
      }

      if (t) {
        var nodeInputT = t["inputs"] || {};
        var nodeWidgetT = t["widgets"] || {};
        for (let itype in nodeData.input) {
          for (let socketname in nodeData.input[itype]) {
            let inp = nodeData.input[itype][socketname];
            if (inp[1] === undefined || !inp[1].tooltip) continue;
            var tooltip = inp[1].tooltip;
            var tooltipT = nodeInputT[tooltip] || nodeWidgetT[tooltip] || tooltip;
            inp[1].tooltip = tooltipT;
          }
        }
        
        var nodeOutputT = t["outputs"] || {};
        for (var i = 0; i < (nodeData.output_tooltips || []).length; i++) {
          var tooltip = nodeData.output_tooltips[i];
          var tooltipT = nodeOutputT[tooltip] || tooltip;
          nodeData.output_tooltips[i] = tooltipT;
        }
      }
    } catch (e) {
      error(`为节点 ${nodeType?.comfyClass || '未知'} 应用描述翻译失败:`, e);
    }
  }
  
  static applyMenuTranslation(app) {
    try {
      if (!isTranslationEnabled()) return;
      
      // Nodes 2.0: 仅做纯文本替换，不触碰画布/布局
      if (TUtils.isVueNodesMode) {
        const t = TUtils.T.Menu || {};
        const tNodes = TUtils.T.Nodes || {};
        const hardMap = {
          "Mask List cap toBatch": "Mask列表转批处理",
          "My OpenPose Node": "我的OpenPose节点",
          "Fill Dark Mask": "填充暗部遮罩",
          "Interpolate KeyFrame": "关键帧插值",
          "Smooth Video": "视频平滑",
          "reBatch Image": "重新批处理图像",
          "alert when finished": "完成时提醒",
          "Merge Image List": "合并图像列表",
          "LayerFilter: Add Grain": "层滤镜：添加胶片颗粒",
          "LayerFilter: ChannelShake": "层滤镜：通道抖动",
          "LayerFilter: ColorMap": "层滤镜：颜色映射",
          "LayerFilter: Film": "层滤镜：胶片",
          "LayerFilter: Film V2": "层滤镜：胶片 V2",
          "LayerFilter: GaussianBlur": "层滤镜：高斯模糊",
          "LayerFilter: HalfTone": "层滤镜：半色调",
          "LayerFilter: LightLeak": "层滤镜：漏光",
          "LayerFilter: HDR Effects": "层滤镜：HDR 效果",
          "LayerFilter: MotionBlur": "层滤镜：运动模糊",
          "LayerFilter: Sharp & Soft": "层滤镜：锐化与柔化",
          "LayerFilter: SkinBeauty": "层滤镜：美肤",
          "LayerFilter: SoftLight": "层滤镜：柔光",
          "LayerFilter: WaterColor": "层滤镜：水彩",
          "Layer Tools": "图层工具",
          "Layer Mask": "图层遮罩",
          "Layer Color": "图层颜色",
          "Layer Style": "图层样式",
          "Load Sana Diffusion Model": "加载 Sana 扩散模型",
          "Load Sana CLIP": "加载 Sana CLIP",
          "Sana Empty Latent Image": "Sana 空潜图",
          "Sana Text Encode": "Sana 文本编码",
          "Load Sana VAE": "加载 Sana VAE",
          "Apply MBCache and Skip Blocks for Sana": "对 Sana 应用 MBCache 并跳过部分块",
          "Apply TeaCache and Skip Blocks": "应用 TeaCache 并跳过部分块",
          "Apply FBCache and Skip Blocks": "应用 FBCache 并跳过部分块",
          "Apply MBCache and Skip Blocks": "应用 MBCache 并跳过部分块",
          "Compile and Quantize Model": "编译并量化模型",
          "Image Load RGB": "加载图像 RGB",
          "Image Load RGBA": "加载图像 RGBA",
          "Load Images From String": "从字符串加载图像",
          "Image Save To Path": "图像保存到路径",
          "Image Extract From Batch": "从批次提取图像",
          "Get Image Batch Count": "获取图像批次数",
          "Mask Resize": "掩码缩放",
          "Mask Like Image Size": "掩码匹配图像尺寸",
          "Image Resize to Square": "图像缩放为正方形",
          "Image Resize by Factor": "按倍数缩放图像",
          "Image Resize by Shorter Side": "按短边缩放图像",
          "Image Resize by Longer Side": "按长边缩放图像",
          "Image Resize to Closest SDXL Resolution": "缩放到最接近 SDXL 分辨率",
          "Image Crop to Closest SDXL Resolution": "裁剪到最接近 SDXL 分辨率",
          "Image Load RGB From Clipboard": "从剪贴板加载 RGB 图像",
          "Image Load RGBA From Clipboard": "从剪贴板加载 RGBA 图像",
          "Integer to Float": "整数转浮点",
          "Integer to String": "整数转字符串",
          "Integer Add": "整数加",
          "Integer Multiply": "整数乘",
          "Integer Divide": "整数除",
          "Integer Absolute Value": "整数绝对值",
          "Integer Minimum": "整数最小值",
          "Integer Maximum": "整数最大值",
          "Float to Integer": "浮点转整数",
          "Float to String": "浮点转字符串",
          "Float Add": "浮点加",
          "Float Subtract": "浮点减",
          "Float Multiply": "浮点乘",
          "Float Divide": "浮点除",
          "Float Absolute Value": "浮点绝对值",
          "Float Minimum": "浮点最小值",
          "Float Maximum": "浮点最大值",
          "String to Integer": "字符串转整数",
          "String to Float": "字符串转浮点",
          "String (Multiline)": "多行字符串",
          "String Concatenate": "字符串拼接",
          "String Replace": "字符串替换",
          "String Split": "字符串分割",
          "String Get Line": "获取字符串行",
          "String Unescape": "字符串反转义",
          "RAFT Estimate": "RAFT 估计",
          "RAFT Flow to Image": "RAFT 光流转图像",
          "RAFT Load Flow from EXR Channels": "RAFT 从 EXR 通道加载光流",
          "Image Stack Channels": "堆叠图像通道",
          "Image Mix": "图像混合",
          "Image Contrast": "图像对比度",
          "Image Saturation": "图像饱和度",
          "Image Levels": "图像色阶",
          "Datetime String": "日期时间字符串",
        };
        const tLower = {};
        Object.entries(t).forEach(([k, v]) => {
          const lk = k?.toLowerCase?.();
          if (lk && !(lk in tLower)) tLower[lk] = v;
        });
        const tNodesLower = {};
        Object.entries(tNodes).forEach(([k, v]) => {
          const lk = k?.toLowerCase?.();
          if (lk && !(lk in tNodesLower)) tNodesLower[lk] = v.title || v.display_name || v.name;
        });
        const mapText = (txt) => {
          if (!txt) return txt;
          const direct = t[txt] || hardMap[txt] || tNodes[txt]?.title;
          if (direct) return direct;
          const trimmed = t[txt?.trim?.()] || hardMap[txt?.trim?.()] || tNodes[txt?.trim?.()]?.title;
          if (trimmed) return trimmed;
          const lower = txt?.toLowerCase?.();
          if (lower && (tLower[lower] || hardMap[lower] || tNodesLower[lower])) return tLower[lower] || hardMap[lower] || tNodesLower[lower];
          if (txt.startsWith("LayerUtility:")) {
            const after = txt.split(":").slice(1).join(":").trim();
            const mappedAfter = mapText(after);
            return (mappedAfter !== after ? mappedAfter : after);
          }
          // 若包含冒号，尝试取冒号后部分匹配
          if (txt.includes(":")) {
            const after = txt.split(":").slice(1).join(":").trim();
            if (after) {
              const mappedAfter = mapText(after);
              if (mappedAfter !== after) return mappedAfter;
            }
          }
          return txt;
        };
        const replaceTextNodes = (root) => {
          if (!root || !root.querySelectorAll) return;
          const elems = root.querySelectorAll("*");
          elems.forEach((el) => {
            el.childNodes?.forEach((node) => {
              if (node.nodeType !== 3) return; // text node
              const raw = node.textContent;
              const txt = raw?.trim?.();
              if (!txt) return;
              if (containsChineseCharacters(raw)) return;
              const mapped = mapText(txt);
              if (mapped && mapped !== raw) {
                node.textContent = raw.replace(txt, mapped);
              }
            });
          });
        };
        replaceTextNodes(document.body);
        // 监听新增菜单节点
        if (!TUtils._vueMenuObserver) {
          TUtils._vueMenuObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
              m.addedNodes?.forEach((n) => replaceTextNodes(n));
            }
          });
          TUtils._vueMenuObserver.observe(document.body, { childList: true, subtree: true });
        }
        return;
      }
      
      // 旧版：使用菜单容器 + 观察器
      if (!app?.ui?.menuContainer) return;
      applyMenuTranslation(TUtils.T);
      // Queue size 单独处理
      const dragHandle = app.ui.menuContainer?.querySelector('.drag-handle');
      if (dragHandle && dragHandle.childNodes[1]) {
        observeFactory(dragHandle.childNodes[1], (mutationsList, observer) => {
          for (let mutation of mutationsList) {
            for (let node of mutation.addedNodes) {
              var match = node.data?.match(/(Queue size:) (\w+)/);
              if (match?.length == 3) {
                const t = TUtils.T.Menu[match[1]] ? TUtils.T.Menu[match[1]] : match[1];
                node.data = t + ' ' + match[2];
              }
            }
          }
        });
      }
    } catch (e) {
      error('应用菜单翻译失败:', e);
    }
  }
  static applyContextMenuTranslation(app) {
    try {
      if (!isTranslationEnabled()) return;
      if (TUtils.isVueNodesMode) {
        const tMenu = TUtils.T.Menu || {};
        const tNodes = TUtils.T.Nodes || {};
        const hardMap = {
          "Mask List cap toBatch": "Mask列表转批处理",
          "My OpenPose Node": "我的OpenPose节点",
          "Fill Dark Mask": "填充暗部遮罩",
          "Interpolate KeyFrame": "关键帧插值",
          "Smooth Video": "视频平滑",
          "reBatch Image": "重新批处理图像",
          "alert when finished": "完成时提醒",
          "Merge Image List": "合并图像列表",
          "LayerFilter: Add Grain": "层滤镜：添加胶片颗粒",
          "LayerFilter: ChannelShake": "层滤镜：通道抖动",
          "LayerFilter: ColorMap": "层滤镜：颜色映射",
          "LayerFilter: Film": "层滤镜：胶片",
          "LayerFilter: Film V2": "层滤镜：胶片 V2",
          "LayerFilter: GaussianBlur": "层滤镜：高斯模糊",
          "LayerFilter: HalfTone": "层滤镜：半色调",
          "LayerFilter: LightLeak": "层滤镜：漏光",
          "LayerFilter: HDR Effects": "层滤镜：HDR 效果",
          "LayerFilter: MotionBlur": "层滤镜：运动模糊",
          "LayerFilter: Sharp & Soft": "层滤镜：锐化与柔化",
          "LayerFilter: SkinBeauty": "层滤镜：美肤",
          "LayerFilter: SoftLight": "层滤镜：柔光",
          "LayerFilter: WaterColor": "层滤镜：水彩",
          "Layer Tools": "图层工具",
          "Layer Mask": "图层遮罩",
          "Layer Color": "图层颜色",
          "Layer Style": "图层样式",
          "Load Sana Diffusion Model": "加载 Sana 扩散模型",
          "Load Sana CLIP": "加载 Sana CLIP",
          "Sana Empty Latent Image": "Sana 空潜图",
          "Sana Text Encode": "Sana 文本编码",
          "Load Sana VAE": "加载 Sana VAE",
          "Apply MBCache and Skip Blocks for Sana": "对 Sana 应用 MBCache 并跳过部分块",
          "Apply TeaCache and Skip Blocks": "应用 TeaCache 并跳过部分块",
          "Apply FBCache and Skip Blocks": "应用 FBCache 并跳过部分块",
          "Apply MBCache and Skip Blocks": "应用 MBCache 并跳过部分块",
          "Compile and Quantize Model": "编译并量化模型",
          "Image Load RGB": "加载图像 RGB",
          "Image Load RGBA": "加载图像 RGBA",
          "Load Images From String": "从字符串加载图像",
          "Image Save To Path": "图像保存到路径",
          "Image Extract From Batch": "从批次提取图像",
          "Get Image Batch Count": "获取图像批次数",
          "Mask Resize": "掩码缩放",
          "Mask Like Image Size": "掩码匹配图像尺寸",
          "Image Resize to Square": "图像缩放为正方形",
          "Image Resize by Factor": "按倍数缩放图像",
          "Image Resize by Shorter Side": "按短边缩放图像",
          "Image Resize by Longer Side": "按长边缩放图像",
          "Image Resize to Closest SDXL Resolution": "缩放到最接近 SDXL 分辨率",
          "Image Crop to Closest SDXL Resolution": "裁剪到最接近 SDXL 分辨率",
          "Image Load RGB From Clipboard": "从剪贴板加载 RGB 图像",
          "Image Load RGBA From Clipboard": "从剪贴板加载 RGBA 图像",
          "Integer to Float": "整数转浮点",
          "Integer to String": "整数转字符串",
          "Integer Add": "整数加",
          "Integer Multiply": "整数乘",
          "Integer Divide": "整数除",
          "Integer Absolute Value": "整数绝对值",
          "Integer Minimum": "整数最小值",
          "Integer Maximum": "整数最大值",
          "Float to Integer": "浮点转整数",
          "Float to String": "浮点转字符串",
          "Float Add": "浮点加",
          "Float Subtract": "浮点减",
          "Float Multiply": "浮点乘",
          "Float Divide": "浮点除",
          "Float Absolute Value": "浮点绝对值",
          "Float Minimum": "浮点最小值",
          "Float Maximum": "浮点最大值",
          "String to Integer": "字符串转整数",
          "String to Float": "字符串转浮点",
          "String (Multiline)": "多行字符串",
          "String Concatenate": "字符串拼接",
          "String Replace": "字符串替换",
          "String Split": "字符串分割",
          "String Get Line": "获取字符串行",
          "String Unescape": "字符串反转义",
          "RAFT Estimate": "RAFT 估计",
          "RAFT Flow to Image": "RAFT 光流转图像",
          "RAFT Load Flow from EXR Channels": "RAFT 从 EXR 通道加载光流",
          "Image Stack Channels": "堆叠图像通道",
          "Image Mix": "图像混合",
          "Image Contrast": "图像对比度",
          "Image Saturation": "图像饱和度",
          "Image Levels": "图像色阶",
          "Datetime String": "日期时间字符串",
        };
        const tLower = {};
        Object.entries(tMenu).forEach(([k, v]) => {
          const lk = k?.toLowerCase?.();
          if (lk && !(lk in tLower)) tLower[lk] = v;
        });
        const tNodesLower = {};
        Object.entries(tNodes).forEach(([k, v]) => {
          const lk = k?.toLowerCase?.();
          if (lk && !(lk in tNodesLower)) tNodesLower[lk] = v.title || v.display_name || v.name;
        });
        const mapText = (txt) => {
          if (!txt) return txt;
          return (
            tMenu[txt] || hardMap[txt] ||
            tMenu[txt?.trim?.()] || hardMap[txt?.trim?.()] ||
            (txt?.toLowerCase && (tLower[txt.toLowerCase()] || hardMap[txt.toLowerCase()] || tNodesLower[txt.toLowerCase()])) ||
            tNodes[txt]?.title || hardMap[tNodes[txt]?.title] ||
            txt
          );
        };
        const mapTextWithColon = (txt) => {
          const mapped = mapText(txt);
          if (mapped !== txt) return mapped;
          if (txt && txt.includes(":")) {
            const after = txt.split(":").slice(1).join(":").trim();
            if (after) {
              const mappedAfter = mapText(after);
              if (mappedAfter !== after) return mappedAfter;
            }
          }
          return txt;
        };
        const replaceTextNodes = (root) => {
          if (!root || !root.querySelectorAll) return;
          const elems = root.querySelectorAll("*");
          elems.forEach((el) => {
            el.childNodes?.forEach((node) => {
              if (node.nodeType !== 3) return; // text
              const raw = node.textContent;
              const txt = raw?.trim?.();
              if (!txt) return;
              if (containsChineseCharacters(raw)) return;
              const mapped = mapTextWithColon(txt);
              if (mapped && mapped !== raw) {
                node.textContent = raw.replace(txt, mapped);
              }
            });
          });
        };
        replaceTextNodes(document.body);
        if (!TUtils._vueCtxObserver) {
          TUtils._vueCtxObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
              m.addedNodes?.forEach((n) => replaceTextNodes(n));
            }
          });
          TUtils._vueCtxObserver.observe(document.body, { childList: true, subtree: true });
        }
        return;
      }
      
      // 右键上下文菜单
      var f = LGraphCanvas.prototype.getCanvasMenuOptions;
      LGraphCanvas.prototype.getCanvasMenuOptions = function () {
        var res = f.apply(this, arguments);
        let menuT = TUtils.T.Menu;
        for (let item of res) {
          if (item == null || !item.hasOwnProperty("content")) continue;
          if (item.content in menuT) {
            item.content = menuT[item.content];
          }
        }
        return res;
      };
      
      const f2 = LiteGraph.ContextMenu;
      LiteGraph.ContextMenu = function (values, options) {
        if (options?.hasOwnProperty("title") && options.title in TUtils.T.Nodes) {
          options.title = TUtils.T.Nodes[options.title]["title"] || options.title;
        }
        
        var t = TUtils.T.Menu;
        var tN = TUtils.T.Nodes;
        var reInput = /Convert (.*) to input/;
        var reWidget = /Convert (.*) to widget/;
        var cvt = t["Convert "] || "Convert ";
        var tinp = t[" to input"] || " to input";
        var twgt = t[" to widget"] || " to widget";
        
        for (let value of values) {
          if (value == null || !value.hasOwnProperty("content")) continue;
          
          if (value.value in tN) {
            value.content = tN[value.value]["title"] || value.content;
            continue;
          }
          
          if (value.content in t) {
            value.content = t[value.content];
            continue;
          }
          
          var extra_info = options.extra || options.parentMenu?.options?.extra;
          
          var matchInput = value.content?.match(reInput);
          if (matchInput) {
            var match = matchInput[1];
            extra_info?.inputs?.find((i) => {
              if (i.name != match) return false;
              match = i.label ? i.label : i.name;
            });
            extra_info?.widgets?.find((i) => {
              if (i.name != match) return false;
              match = i.label ? i.label : i.name;
            });
            value.content = cvt + match + tinp;
            continue;
          }
          
          var matchWidget = value.content?.match(reWidget);
          if (matchWidget) {
            var match = matchWidget[1];
            extra_info?.inputs?.find((i) => {
              if (i.name != match) return false;
              match = i.label ? i.label : i.name;
            });
            extra_info?.widgets?.find((i) => {
              if (i.name != match) return false;
              match = i.label ? i.label : i.name;
            });
            value.content = cvt + match + twgt;
            continue;
          }
        }

        const ctx = f2.call(this, values, options);
        return ctx;
      };
      LiteGraph.ContextMenu.prototype = f2.prototype;
    } catch (e) {
      error("应用上下文菜单翻译失败:", e);
    }
  }
  static addRegisterNodeDefCB(app) {
    try {
      if (TUtils.isVueNodesMode) return;
      const f = app.registerNodeDef;
      app.registerNodeDef = async function (nodeId, nodeData) {
        var res = f.apply(this, arguments);
        res.then(() => {
          TUtils.applyNodeTypeTranslationEx(nodeId);
        });
        return res;
      };
    } catch (e) {
      error("添加节点定义注册回调失败:", e);
    }
  }
  static addPanelButtons(app) {
    try {
      // Nodes2.0 下不再提供“附加翻译”切换按钮，避免影响前端布局
      if (TUtils.isVueNodesMode) return;
      if(document.getElementById("toggle-translation-button")) return;
      
      const translationEnabled = isTranslationEnabled();
      
      // 创建样式元素，添加按钮动画效果
      const styleElem = document.createElement('style');
      styleElem.textContent = `
        @keyframes flowEffect {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        
        .dd-translation-active {
          background: linear-gradient(90deg, #e6a919, #f4d03f, #f9e79f, #f4d03f, #e6a919);
          background-size: 300% 100%;
          color: #333;
          border: none;
          animation: flowEffect 5s ease infinite;
          text-shadow: 0 1px 1px rgba(0,0,0,0.1);
          box-shadow: 0 0 5px rgba(244, 208, 63, 0.5);
          transition: all 0.3s ease;
        }
        
        .dd-translation-inactive {
          background: linear-gradient(90deg, #1a5276, #2980b9, #3498db, #2980b9, #1a5276);
          background-size: 300% 100%;
          color: white;
          border: none;
          animation: flowEffect 7s ease infinite;
          box-shadow: 0 0 5px rgba(52, 152, 219, 0.5);
          transition: all 0.3s ease;
        }
        
        .dd-translation-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.2);
          cursor: pointer;
        }

        .dd-translation-btn {
          cursor: pointer;
        }
      `;
      document.head.appendChild(styleElem);
      
      // 添加旧版UI的切换按钮
      if(document.querySelector(".comfy-menu") && !document.getElementById("toggle-translation-button")) {
        app.ui.menuContainer.appendChild(
          $el("button.dd-translation-btn", {
            id: "toggle-translation-button",
            textContent: translationEnabled ? "附加翻译" : "官方实现",
            className: translationEnabled ? "dd-translation-btn dd-translation-active" : "dd-translation-btn dd-translation-inactive",
            style: {
              fontWeight: "bold",
              fontSize: "12px",
              padding: "5px 10px",
              borderRadius: "4px",
            },
            title: translationEnabled ? "已开启额外附加翻译" : "已使用官方原生翻译",
            onclick: async () => {
              await toggleTranslation();
            },
          })
        );
      }
      
      // 添加新版UI的切换按钮
      try {
        if(window?.comfyAPI?.button?.ComfyButton && window?.comfyAPI?.buttonGroup?.ComfyButtonGroup) {
          var ComfyButtonGroup = window.comfyAPI.buttonGroup.ComfyButtonGroup;
          var ComfyButton = window.comfyAPI.button.ComfyButton;
          
          var btn = new ComfyButton({
            action: async () => {
              await toggleTranslation();
            },
            tooltip: translationEnabled ? "已开启额外附加翻译" : "已使用官方原生翻译",
            content: translationEnabled ? "附加翻译" : "官方实现",
            classList: "toggle-translation-button"
          });
          
          // 设置按钮样式
          if(btn.element) {
            btn.element.classList.add("dd-translation-btn");
            btn.element.classList.add(translationEnabled ? "dd-translation-active" : "dd-translation-inactive");
            btn.element.style.fontWeight = "bold";
            btn.element.style.fontSize = "12px";
            btn.element.style.padding = "5px 10px";
            btn.element.style.borderRadius = "4px";
          }
          
          var group = new ComfyButtonGroup(btn.element);
          if(app.menu?.settingsGroup?.element) {
            app.menu.settingsGroup.element.before(group.element);
          }
        }
      } catch(e) {
        error("添加新版UI语言按钮失败:", e);
      }
    } catch (e) {
      error("添加面板按钮失败:", e);
    }
  }static addNodeTitleMonitoring(app) {
    try {
      if (TUtils.isVueNodesMode) return;
      if (typeof LGraphNode === 'undefined') {
        error("LGraphNode未定义，无法设置标题监听");
        return;
      }
      
      const originalSetTitle = LGraphNode.prototype.setTitle || function(title) {
        this.title = title;
      };
      
      LGraphNode.prototype.setTitle = function(title) {
        if (title && title !== this.constructor.title) {
          this._dd_custom_title = true;
        }
        return originalSetTitle.call(this, title);
      };
    } catch (e) {
      error("添加节点标题监听失败:", e);
    }
  }
  static normalizeLayout(app, opts = {}) {
    try {
      // Nodes2.0 下停用自动归一化布局，避免干扰画布坐标
      return;
      if (!TUtils.isVueNodesMode) return;
      if (!isTranslationEnabled()) return;
      const g = app?.graph;
      const ds = app?.canvas?.ds;
      if (!g?._nodes?.length || !ds) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of g._nodes) {
        minX = Math.min(minX, n.pos[0]);
        minY = Math.min(minY, n.pos[1]);
        maxX = Math.max(maxX, n.pos[0]);
        maxY = Math.max(maxY, n.pos[1]);
      }
      const width = maxX - minX;
      const height = maxY - minY;
      const targetW = opts.targetW || 900;
      const targetH = opts.targetH || 600;

      const scaleX = targetW / Math.max(1, width);
      const scaleY = targetH / Math.max(1, height);
      const s = Math.min(scaleX, scaleY, 1);
      const margin = opts.margin || 150;

      g._nodes.forEach(n => {
        n.pos[0] = (n.pos[0] - minX) * s + margin;
        n.pos[1] = (n.pos[1] - minY) * s + margin;
      });

      ds.scale = 1;
      ds.offset = [0, 0];
      g.setDirtyCanvas(true, true);
      app.canvas.draw(true, true);
      console.log("[DD-Translation] normalized layout", {s, width, height});
    } catch (e) {
      error("规范化布局失败:", e);
    }
  }
}

const ext = {
  name: "AIGODLIKE.Translation",
  async init(app) {
    try {
      // 强制 Vue 模式，不再依赖前端状态探测

      await initConfig();
      if (!TUtils.isVueNodesMode) {
        TUtils.enhandeDrawNodeWidgets();
      }
      // Vue 模式下，翻译开启会刷新页面，偶尔会导致画布缩放留在极小值，出现“飞线”错觉。
      // 检测到 Vue 模式且翻译启用时，初始化时把缩放/偏移恢复到默认，避免长线视觉问题。
      // Vue/Nodes2.0 下不再重置画布缩放和偏移，避免引入错位
      await TUtils.syncTranslation();
    } catch (e) {
      error("扩展初始化失败:", e);
    }
  },
  async setup(app) {
    try {
      const isComfyUIChineseNative = document.documentElement.lang === 'zh-CN';

      // Nodes 2.0 / Vue 前端：跳过旧版 LiteGraph/DOM 补丁，仅注入翻译资源
      if (TUtils.isVueNodesMode) {
        if (isTranslationEnabled() && !isComfyUIChineseNative) {
          try {
            if (window?.comfyAPI?.i18n?.addTranslations) {
              window.comfyAPI.i18n.addTranslations("zh-CN", TUtils.T.Menu || {});
            }
          } catch (e) {
            error("注入 Nodes2.0 菜单翻译失败:", e);
          }
        }
        // i18n 接口不可用时，回退到安全的文本替换方式（仅菜单文案）
        if (isTranslationEnabled()) {
          TUtils.applyMenuTranslation(app);
        }
        return;
      }

      TUtils.addNodeTitleMonitoring(app);

      if (!isTranslationEnabled()) return;

      TUtils.applyNodeTypeTranslation(app);
      TUtils.applyContextMenuTranslation(app);

      if (!isComfyUIChineseNative) {
        TUtils.applyMenuTranslation(app);
      }

      TUtils.addRegisterNodeDefCB(app);
    } catch (e) {
      error("扩展设置失败:", e);
    }
  },
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
    try {
      TUtils.applyNodeDescTranslation(nodeType, nodeData, app);
    } catch (e) {
      error(`注册节点定义前处理失败 (${nodeType?.comfyClass || '未知'}):`, e);
    }
  },
  beforeRegisterVueAppNodeDefs(nodeDefs) {
    try {
      // 如果翻译被禁用，直接返回
      if (!isTranslationEnabled()) {
        return;
      }
      
      TUtils.isVueNodesMode = true;
      
      nodeDefs.forEach(TUtils.applyVueNodeDisplayNameTranslation);
      nodeDefs.forEach(TUtils.applyVueNodeTranslation);
      nodeDefs.forEach(TUtils.applyVueNodeDeepTranslation);
    } catch (e) {
      error("注册Vue应用节点定义前处理失败:", e);
    }
  },  loadedGraphNode(node, app) {
    try {
      const originalTitle = node.constructor.comfyClass || node.constructor.type;
      const nodeT = TUtils.T.Nodes[originalTitle];
      const translatedTitle = nodeT?.title;
      
      if (node.title && 
          node.title !== originalTitle && 
          node.title !== translatedTitle) {
        node._dd_custom_title = true;
      }
      
      // 无论翻译是否启用都调用，让方法内部判断
      TUtils.applyNodeTranslation(node);
    } catch (e) {
      error(`加载图表节点处理失败 (${node?.title || '未知'}):`, e);
    }
  },
  
  nodeCreated(node, app) {
    try {
      // 无论翻译是否启用都调用，让方法内部判断
      TUtils.applyNodeTranslation(node);
    } catch (e) {
      error(`创建节点处理失败 (${node?.title || '未知'}):`, e);
    }
  },
};

app.registerExtension(ext);
