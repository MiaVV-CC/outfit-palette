# 第三方组件

穿搭工作台随附以下第三方文件，均未修改。各自的许可证原文与文件放在一起。

| 组件 | 版本 | 文件 | 来源 | 许可证 | 再分发条件 |
|---|---|---|---|---|---|
| MediaPipe Tasks Vision（Web 运行文件） | 1.1.1 | `skill/web/vendor/mediapipe/vision_bundle.mjs`、`skill/web/vendor/mediapipe/wasm/*` | npm 包 `@mediapipe/tasks-vision@1.1.1`（Google） | Apache License 2.0，原文见 `skill/web/vendor/mediapipe/LICENSE.txt`（含上游附加声明） | 随附许可证原文 |
| SelfieMulticlass 256×256 人像分割模型 | 2023-05-10 模型卡 | `skill/web/models/selfie_multiclass_256x256.tflite` | Google MediaPipe Image Segmenter 文档提供的模型 | Apache License 2.0（模型卡注明），原文见 `skill/web/models/LICENSE.txt` | 随附许可证原文 |
| Cormorant Garamond 字体（Latin，400） | Google Fonts v21 | `skill/web/fonts/cormorant-latin-400.woff2` | Google Fonts（Cormorant Project） | SIL Open Font License 1.1，原文见 `skill/web/fonts/OFL.txt` | 随附许可证；不得单独出售字体文件 |

## 校验值（SHA-256）

```text
a84921e02321e582484c1f8126d344b5f33b791fa09c640a52e20ee8632068f1  skill/web/vendor/mediapipe/vision_bundle.mjs
6522286aa32dd93eff17c3da002b0649516f87abfec7a80b5bfe5c9625caa5f8  skill/web/vendor/mediapipe/wasm/vision_wasm_internal.js
0e101a010e262ef8e78f22e3c95b60a9705fd06962753c9acd6356d9fb56b7bd  skill/web/vendor/mediapipe/wasm/vision_wasm_internal.wasm
539a4386fd12d0723d6e900ec80467d168ba7290dda2f79e77a2181b8e906115  skill/web/vendor/mediapipe/wasm/vision_wasm_module_internal.js
3b57e4b55ac6346bf940212e3e11250b308a6a474077385e2f527b119cf74525  skill/web/vendor/mediapipe/wasm/vision_wasm_module_internal.wasm
942654dbdcebce08ea039af23d18e58bebf23c8607d74023d2df7071c8a7b638  skill/web/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js
c9b1b69bb87baf9e529254d8559dcbcf4c5a9c0eda84f56a12f17d675335ec9c  skill/web/vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm
c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0  skill/web/models/selfie_multiclass_256x256.tflite
982538ce965491bddd0cd96f81c7c694ce19a3f4af7efbc9316ead7820b34c14  skill/web/fonts/cormorant-latin-400.woff2
```

## 网络行为说明

MediaPipe 1.1.1 的 `vision_bundle.mjs` 含有向 Google 上报使用指标的代码。穿搭工作台在识别线程里只允许请求同一网址的资源；通过本机服务打开时，内容安全策略也只允许连接自身。因此这类上报不会发出，照片也不会离开设备。
