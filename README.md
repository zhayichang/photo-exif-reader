# EXIF 信息读取工具

一个可以部署到 GitHub Pages 的纯静态照片元数据读取网页。

## 本地测试

直接双击打开项目根目录中的 `index.html` 即可。

如果需要模拟 GitHub Pages 的访问方式，也可以启动本地服务器：

```bash
cd "/Users/welkinzha/Desktop/Developing/exif-reader"
python3 -m http.server 4173
```

然后打开：<http://127.0.0.1:4173>

按 `Control + C` 停止。

## 支持范围

页面使用本地打包的 exifr 7.1.3，读取 JPEG、TIFF、PNG、HEIC、AVIF 中的 EXIF、XMP、IPTC、ICC、JFIF 等元数据。当前版本不支持 CR2、CR3、NEF、ARW、DNG 等 RAW 格式。

读取结果包括拍摄参数、焦段、白平衡、位置、图像规格、色彩配置、Lightroom 调整、裁切与几何、曲线与 HSL、编辑时间线、评分关键词、版权、设备档案、内置缩略图、元数据完整度与字段冲突。页面还会根据图片像素生成 RGB 直方图和主色板。

某类元数据不存在时，对应卡片会自动隐藏，不影响其他信息与像素分析。

## 部署到 GitHub Pages

1. 将整个 `exif-reader` 文件夹提交到 GitHub 仓库。
2. 在仓库的 **Settings → Pages** 中，将来源设为 **Deploy from a branch**。
3. 选择要发布的分支，并将目录设为 **`/ (root)`**。
4. 保存后等待 GitHub Pages 完成部署。

网站文件已经位于仓库根目录，不依赖 Node.js，也不会调用外部 CDN。
