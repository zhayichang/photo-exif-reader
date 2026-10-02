const elements = {
  fileInput: document.querySelector("#file-input"),
  dropZone: document.querySelector("#drop-zone"),
  status: document.querySelector("#status"),
  results: document.querySelector("#results"),
  previewShell: document.querySelector("#preview-shell"),
  preview: document.querySelector("#preview"),
  previewFallback: document.querySelector("#preview-fallback"),
  fileName: document.querySelector("#file-name"),
  fileMeta: document.querySelector("#file-meta"),
  cameraModel: document.querySelector("#camera-model"),
  lensModel: document.querySelector("#lens-model"),
  captureTime: document.querySelector("#capture-time"),
  imageSize: document.querySelector("#image-size"),
  aperture: document.querySelector("#aperture"),
  shutter: document.querySelector("#shutter"),
  iso: document.querySelector("#iso"),
  exposureCompensation: document.querySelector("#exposure-compensation"),
  tagTotal: document.querySelector("#tag-total"),
  privacyScore: document.querySelector("#privacy-score"),
  privacyList: document.querySelector("#privacy-list"),
  summaryList: document.querySelector("#summary-list"),
  search: document.querySelector("#search"),
  groupFilter: document.querySelector("#group-filter"),
  metadataBody: document.querySelector("#metadata-body"),
  emptyFilter: document.querySelector("#empty-filter"),
  engine: document.querySelector("#engine"),
  chooseAnother: document.querySelector("#choose-another"),
  shooting: document.querySelector("#module-shooting"),
  shootingGrid: document.querySelector("#shooting-grid"),
  focal: document.querySelector("#module-focal"),
  focalValue: document.querySelector("#focal-value"),
  focalMarker: document.querySelector("#focal-marker"),
  focalNote: document.querySelector("#focal-note"),
  whiteBalance: document.querySelector("#module-white-balance"),
  temperatureValue: document.querySelector("#temperature-value"),
  temperatureMarker: document.querySelector("#temperature-marker"),
  whiteBalanceList: document.querySelector("#white-balance-list"),
  location: document.querySelector("#module-location"),
  compassArrow: document.querySelector("#compass-arrow"),
  locationList: document.querySelector("#location-list"),
  imageSpecList: document.querySelector("#image-spec-list"),
  formatVisual: document.querySelector("#format-visual"),
  formatRatio: document.querySelector("#format-ratio"),
  colorProfile: document.querySelector("#module-color-profile"),
  colorProfileList: document.querySelector("#color-profile-list"),
  editing: document.querySelector("#module-editing"),
  adjustmentGrid: document.querySelector("#adjustment-grid"),
  crop: document.querySelector("#module-crop"),
  cropFrame: document.querySelector("#crop-frame"),
  cropList: document.querySelector("#crop-list"),
  colorEdit: document.querySelector("#module-color-edit"),
  toneCurve: document.querySelector("#tone-curve"),
  hslBars: document.querySelector("#hsl-bars"),
  timelineModule: document.querySelector("#module-timeline"),
  timeline: document.querySelector("#timeline"),
  catalog: document.querySelector("#module-catalog"),
  rating: document.querySelector("#rating"),
  keywordList: document.querySelector("#keyword-list"),
  catalogList: document.querySelector("#catalog-list"),
  rights: document.querySelector("#module-rights"),
  rightsList: document.querySelector("#rights-list"),
  equipment: document.querySelector("#module-equipment"),
  equipmentList: document.querySelector("#equipment-list"),
  thumbnailModule: document.querySelector("#module-thumbnail"),
  embeddedThumbnail: document.querySelector("#embedded-thumbnail"),
  coverageGrid: document.querySelector("#coverage-grid"),
  conflicts: document.querySelector("#module-conflicts"),
  conflictList: document.querySelector("#conflict-list"),
  structureBar: document.querySelector("#structure-bar"),
  structureLegend: document.querySelector("#structure-legend"),
  histogramCanvas: document.querySelector("#histogram-canvas"),
  histogramStatus: document.querySelector("#histogram-status"),
  palette: document.querySelector("#palette"),
  paletteStatus: document.querySelector("#palette-status"),
};

let metadataRows = [];
let previewUrl;
let thumbnailUrl;

elements.fileInput.addEventListener("change", () => {
  const [file] = elements.fileInput.files;
  if (file) readFile(file);
});

elements.chooseAnother.addEventListener("click", () => elements.fileInput.click());
elements.search.addEventListener("input", renderRows);
elements.groupFilter.addEventListener("change", renderRows);

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-dragging");
  });
}

elements.dropZone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (file) readFile(file);
});

async function readFile(file) {
  setStatus(`正在读取 ${file.name}…`);
  elements.dropZone.classList.add("is-loading");

  try {
    let parsed = {};
    let metadataWarning = "";
    try {
      parsed = await window.exifr.parse(file, {
        tiff: true,
        ifd0: true,
        ifd1: true,
        exif: true,
        gps: true,
        interop: true,
        userComment: true,
        xmp: true,
        iptc: true,
        icc: true,
        jfif: true,
        ihdr: true,
        mergeOutput: false,
        chunked: true,
      }) || {};
    } catch (error) {
      metadataWarning = error.message || "元数据解析失败";
    }
    const dimensions = await getImageDimensions(file);
    const result = {
      file: { name: file.name, size: file.size, type: file.type },
      tags: flattenMetadata(parsed, file, dimensions),
      engine: "由 exifr 7.1.3 提供元数据解析",
    };
    renderResult(result, file);
    await Promise.allSettled([renderPixelAnalysis(file), renderEmbeddedThumbnail(file)]);
    setStatus(metadataWarning ? `未能完整读取元数据：${metadataWarning}。文件信息和画面分析仍可使用。` : "", Boolean(metadataWarning));
  } catch (error) {
    setStatus(`${error.message || "读取失败。"} 请确认它是受支持的成品图片，而不是 RAW 文件。`, true);
  } finally {
    elements.dropZone.classList.remove("is-loading");
    elements.fileInput.value = "";
  }
}

function renderResult(result, file) {
  const tags = result.tags;
  metadataRows = Object.entries(tags)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => {
      const separator = key.indexOf(":");
      const group = separator > 0 ? key.slice(0, separator) : "解析信息";
      const tag = separator > 0 ? key.slice(separator + 1) : key;
      const displayValue = formatValue(value);
      return { group, tag, displayValue, searchable: `${group} ${tag} ${displayValue}`.toLowerCase() };
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.tag.localeCompare(b.tag));

  const width = findTag(tags, ["ImageWidth", "ExifImageWidth", "CanonImageWidth"]);
  const height = findTag(tags, ["ImageHeight", "ImageLength", "ExifImageHeight", "CanonImageHeight"]);
  const fileType = findTag(tags, ["FileType", "FileTypeExtension"]) || file.name.split(".").pop()?.toUpperCase() || "FILE";

  elements.fileName.textContent = result.file.name;
  elements.fileMeta.textContent = `${fileType} · ${formatBytes(result.file.size)}${width && height ? ` · ${width} × ${height}` : ""}`;
  elements.cameraModel.textContent = findTag(tags, ["Model", "CameraModelName"]) || "未记录相机型号";
  elements.lensModel.textContent = findTag(tags, ["LensModel", "LensType", "LensID"]) || "未记录镜头型号";
  elements.captureTime.textContent = findTag(tags, ["DateTimeOriginal", "CreateDate", "DateCreated"]) || "未记录";
  elements.imageSize.textContent = width && height ? `${width} × ${height}` : findTag(tags, ["ImageSize"]) || "未记录";
  elements.aperture.textContent = formatAperture(findTag(tags, ["FNumber", "Aperture"]));
  elements.shutter.textContent = formatShutter(findTag(tags, ["ExposureTime", "ShutterSpeed"]));
  elements.iso.textContent = findTag(tags, ["ISO", "BaseISO"]) || "—";
  const exposureCompensation = toNumber(findRawTag(tags, ["ExposureCompensation", "ExposureBiasValue"]));
  elements.exposureCompensation.textContent = exposureCompensation === undefined ? "—" : `${exposureCompensation > 0 ? "+" : ""}${formatNumber(exposureCompensation)} EV`;
  elements.tagTotal.textContent = `${metadataRows.length} 个可读标签 · ${new Set(metadataRows.map((row) => row.group)).size} 个分组`;
  elements.engine.textContent = result.engine;
  elements.previewFallback.textContent = String(fileType).slice(0, 5);

  renderPreview(file);
  renderPrivacy(tags);
  renderSummary(tags);
  renderGroupOptions();
  renderRows();
  renderExtendedInsights(tags, file, width, height);

  elements.results.hidden = false;
  elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPreview(file) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  elements.previewShell.classList.remove("has-preview");
  previewUrl = URL.createObjectURL(file);
  elements.preview.onload = () => elements.previewShell.classList.add("has-preview");
  elements.preview.onerror = () => elements.previewShell.classList.remove("has-preview");
  elements.preview.src = previewUrl;
}

function renderExtendedInsights(tags, file, width, height) {
  renderShooting(tags);
  renderFocal(tags);
  renderWhiteBalance(tags);
  renderLocation(tags);
  renderImageSpecs(tags, file, width, height);
  renderColorProfile(tags);
  renderDevelopAdjustments(tags);
  renderCrop(tags);
  renderToneAndColor(tags);
  renderTimeline(tags);
  renderCatalog(tags);
  renderRights(tags);
  renderEquipment(tags);
  renderCoverage(tags);
  renderConflicts(tags);
  renderStructure();
  elements.thumbnailModule.hidden = true;
  elements.histogramStatus.hidden = false;
  elements.histogramStatus.textContent = "正在分析画面…";
  elements.paletteStatus.hidden = false;
  elements.paletteStatus.textContent = "正在提取颜色…";
  elements.palette.replaceChildren();
}

function renderShooting(tags) {
  const facts = collectFacts(tags, [
    ["曝光模式", ["ExposureMode", "ExposureProgram"]],
    ["测光模式", ["MeteringMode"]],
    ["对焦模式", ["FocusMode", "AFMode", "AFAreaMode"]],
    ["拍摄模式", ["DriveMode", "ShootingMode", "SceneCaptureType"]],
    ["闪光灯", ["Flash", "FlashMode"]],
    ["防抖", ["ImageStabilization", "Stabilization"]],
    ["自拍延时", ["SelfTimer", "SelfTimerMode"]],
  ]);
  setModule(elements.shooting, facts.length > 0);
  elements.shootingGrid.replaceChildren(...facts.map(([label, value]) => makeFact(label, value)));
}

function renderFocal(tags) {
  const equivalentRaw = findRawTag(tags, ["FocalLengthIn35mmFormat", "FocalLength35efl", "FocalLengthIn35mmFilm"]);
  const actualRaw = findRawTag(tags, ["FocalLength"]);
  const equivalent = toNumber(equivalentRaw) || toNumber(actualRaw);
  setModule(elements.focal, Boolean(equivalent));
  if (!equivalent) return;
  const actual = toNumber(actualRaw);
  const position = clamp((Math.log(clamp(equivalent, 10, 600)) - Math.log(10)) / (Math.log(600) - Math.log(10)) * 100, 0, 100);
  elements.focalMarker.style.left = `${position}%`;
  elements.focalValue.textContent = `${formatNumber(equivalent)} mm`;
  const view = equivalent < 24 ? "超广角视角" : equivalent < 35 ? "广角视角" : equivalent < 60 ? "标准视角" : equivalent < 135 ? "中长焦视角" : "长焦视角";
  elements.focalNote.textContent = equivalentRaw && actual && Math.abs(actual - equivalent) > 0.1
    ? `${view} · 实际焦距 ${formatNumber(actual)} mm · 35mm 等效`
    : view;
}

function renderWhiteBalance(tags) {
  const temperature = toNumber(findRawTag(tags, ["ColorTemperature", "Temperature", "WBColorTemp"]));
  const facts = collectFacts(tags, [
    ["白平衡", ["WhiteBalance", "WhiteBalanceMode"]],
    ["色调", ["Tint"]],
    ["色彩空间", ["ColorSpace"]],
    ["光源", ["LightSource"]],
  ]);
  setModule(elements.whiteBalance, Boolean(temperature || facts.length));
  if (!temperature && !facts.length) return;
  elements.temperatureValue.textContent = temperature ? `${Math.round(temperature)} K` : "未记录色温";
  elements.temperatureMarker.style.left = `${temperature ? clamp((temperature - 2000) / 100, 0, 100) : 50}%`;
  renderFactList(elements.whiteBalanceList, facts);
}

function renderLocation(tags) {
  const latitude = toNumber(findRawTag(tags, ["latitude", "GPSLatitude"]));
  const longitude = toNumber(findRawTag(tags, ["longitude", "GPSLongitude"]));
  const direction = toNumber(findRawTag(tags, ["GPSImgDirection", "GPSDestBearing"]));
  const altitude = findRawTag(tags, ["GPSAltitude"]);
  const speed = findRawTag(tags, ["GPSSpeed"]);
  const facts = [];
  if (latitude !== undefined && longitude !== undefined) facts.push(["坐标", `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`]);
  if (altitude !== undefined) facts.push(["海拔", `${formatValue(altitude)} m`]);
  if (direction !== undefined) facts.push(["拍摄方向", `${formatNumber(direction)}°`]);
  if (speed !== undefined) facts.push(["速度", formatValue(speed)]);
  setModule(elements.location, facts.length > 0);
  if (!facts.length) return;
  elements.compassArrow.style.transform = `rotate(${direction || 0}deg)`;
  renderFactList(elements.locationList, facts);
}

function renderImageSpecs(tags, file, width, height) {
  const numericWidth = toNumber(findRawTag(tags, ["ImageWidth", "ExifImageWidth", "PixelXDimension"])) || toNumber(width);
  const numericHeight = toNumber(findRawTag(tags, ["ImageHeight", "ImageLength", "ExifImageHeight", "PixelYDimension"])) || toNumber(height);
  const facts = [];
  if (numericWidth && numericHeight) {
    const divisor = greatestCommonDivisor(Math.round(numericWidth), Math.round(numericHeight));
    const ratio = `${Math.round(numericWidth / divisor)}:${Math.round(numericHeight / divisor)}`;
    facts.push(["像素尺寸", `${numericWidth} × ${numericHeight}`], ["画幅比例", ratio], ["总像素", `${(numericWidth * numericHeight / 1e6).toFixed(1)} MP`]);
    elements.formatRatio.textContent = ratio;
    elements.formatVisual.style.aspectRatio = `${numericWidth} / ${numericHeight}`;
    elements.formatVisual.style.width = numericWidth >= numericHeight ? "160px" : "92px";
    elements.formatVisual.style.height = "auto";
  } else {
    elements.formatRatio.textContent = "尺寸未知";
  }
  facts.push(["文件大小", formatBytes(file.size)]);
  facts.push(...collectFacts(tags, [
    ["方向", ["Orientation"]],
    ["位深", ["BitsPerSample", "BitDepth"]],
    ["压缩", ["Compression"]],
    ["分辨率", ["XResolution"]],
  ]));
  renderFactList(elements.imageSpecList, facts);
}

function renderColorProfile(tags) {
  const facts = collectFacts(tags, [
    ["配置名称", ["ProfileDescription", "ICCProfileName"]],
    ["色彩空间", ["ColorSpace", "ColorSpaceData"]],
    ["配置版本", ["ProfileVersion"]],
    ["设备类别", ["ProfileClass", "DeviceClass"]],
    ["渲染意图", ["RenderingIntent"]],
    ["色彩组件", ["ColorComponents", "ProfileConnectionSpace"]],
    ["白点", ["MediaWhitePoint", "WhitePoint"]],
  ]);
  setModule(elements.colorProfile, facts.length > 0);
  renderFactList(elements.colorProfileList, facts);
}

function renderDevelopAdjustments(tags) {
  const settings = [
    ["曝光", ["Exposure2012", "Exposure"], -5, 5],
    ["对比度", ["Contrast2012", "Contrast"], -100, 100],
    ["高光", ["Highlights2012", "Highlights"], -100, 100],
    ["阴影", ["Shadows2012", "Shadows"], -100, 100],
    ["白色色阶", ["Whites2012", "Whites"], -100, 100],
    ["黑色色阶", ["Blacks2012", "Blacks"], -100, 100],
    ["纹理", ["Texture"], -100, 100],
    ["清晰度", ["Clarity2012", "Clarity"], -100, 100],
    ["去朦胧", ["Dehaze"], -100, 100],
    ["自然饱和度", ["Vibrance"], -100, 100],
    ["饱和度", ["Saturation"], -100, 100],
    ["锐化", ["Sharpness"], 0, 150],
    ["降噪", ["LuminanceSmoothing", "NoiseReduction"], 0, 100],
    ["暗角", ["PostCropVignetteAmount", "VignetteAmount"], -100, 100],
    ["颗粒", ["GrainAmount"], 0, 100],
  ];
  const rows = settings.map(([label, names, min, max]) => {
    const raw = findRawTag(tags, names);
    const value = toNumber(raw);
    return value === undefined ? null : makeAdjustment(label, value, min, max);
  }).filter(Boolean);
  setModule(elements.editing, rows.length > 0);
  elements.adjustmentGrid.replaceChildren(...rows);
}

function renderCrop(tags) {
  const keys = ["CropTop", "CropLeft", "CropBottom", "CropRight", "CropAngle", "PerspectiveVertical", "PerspectiveHorizontal", "PerspectiveRotate", "UprightTransformCount"];
  const present = keys.some((key) => findRawTag(tags, [key]) !== undefined) || Boolean(findRawTag(tags, ["HasCrop"]));
  setModule(elements.crop, present);
  if (!present) return;
  const top = clamp(toNumber(findRawTag(tags, ["CropTop"])) ?? 0, 0, 1);
  const left = clamp(toNumber(findRawTag(tags, ["CropLeft"])) ?? 0, 0, 1);
  const bottom = clamp(toNumber(findRawTag(tags, ["CropBottom"])) ?? 1, 0, 1);
  const right = clamp(toNumber(findRawTag(tags, ["CropRight"])) ?? 1, 0, 1);
  elements.cropFrame.style.inset = `${top * 100}% ${(1 - right) * 100}% ${(1 - bottom) * 100}% ${left * 100}%`;
  const facts = collectFacts(tags, [
    ["裁切角度", ["CropAngle"]],
    ["旋转", ["PerspectiveRotate"]],
    ["垂直透视", ["PerspectiveVertical"]],
    ["水平透视", ["PerspectiveHorizontal"]],
    ["自动校正", ["UprightVersion", "UprightCenterMode"]],
    ["镜头配置", ["LensProfileEnable", "LensProfileName"]],
  ]);
  renderFactList(elements.cropList, facts.length ? facts : [["裁切范围", `${Math.round((right - left) * 100)}% × ${Math.round((bottom - top) * 100)}%`]]);
}

function renderToneAndColor(tags) {
  const curveRaw = findRawTag(tags, ["ToneCurvePV2012", "ToneCurve", "ToneCurvePV2012Red"]);
  const curve = parseCurve(curveRaw);
  const colors = [
    ["红", "Red", "#ef5b62"], ["橙", "Orange", "#ef8c3c"], ["黄", "Yellow", "#d9ae28"], ["绿", "Green", "#42a66a"],
    ["浅绿", "Aqua", "#3bb5af"], ["蓝", "Blue", "#4688e8"], ["紫", "Purple", "#9a6ee3"], ["洋红", "Magenta", "#d85ca4"],
  ];
  const hslRows = [];
  for (const [name, key, color] of colors) {
    for (const [label, prefix] of [["色相", "HueAdjustment"], ["饱和度", "SaturationAdjustment"], ["明亮度", "LuminanceAdjustment"]]) {
      const value = toNumber(findRawTag(tags, [`${prefix}${key}`]));
      if (value !== undefined && value !== 0) hslRows.push(makeHslRow(`${label}·${name}`, value, color));
    }
  }
  setModule(elements.colorEdit, curve.length > 1 || hslRows.length > 0);
  elements.hslBars.replaceChildren(...hslRows);
  drawToneCurve(curve);
}

function renderTimeline(tags) {
  const candidates = [
    ["拍摄", ["DateTimeOriginal", "DateCreated"]],
    ["数字化", ["CreateDate"]],
    ["元数据修改", ["MetadataDate"]],
    ["文件修改", ["ModifyDate", "FileModifyDate", "LastModified"]],
  ];
  const items = [];
  for (const [label, names] of candidates) {
    const value = findRawTag(tags, names);
    if (value !== undefined) items.push([label, formatValue(value)]);
  }
  const software = findRawTag(tags, ["Software", "CreatorTool"]);
  if (software !== undefined) items.push(["处理软件", formatValue(software)]);
  const history = findRawTag(tags, ["History"]);
  if (Array.isArray(history)) {
    for (const entry of history.slice(0, 6)) {
      const label = entry?.action || entry?.parameters || "编辑记录";
      const when = entry?.when || entry?.changed || entry?.softwareAgent || formatValue(entry);
      items.push([formatValue(label), formatValue(when)]);
    }
  }
  const unique = [...new Map(items.map((item) => [`${item[0]}:${item[1]}`, item])).values()];
  setModule(elements.timelineModule, unique.length > 1);
  elements.timeline.replaceChildren(...unique.map(([label, value]) => {
    const row = document.createElement("div"); row.className = "timeline-item";
    const strong = document.createElement("strong"); strong.textContent = label;
    const span = document.createElement("span"); span.textContent = value;
    row.append(strong, span); return row;
  }));
}

function renderCatalog(tags) {
  const rating = toNumber(findRawTag(tags, ["Rating"]));
  const keywords = normalizeList(findRawTag(tags, ["Subject", "Keywords", "HierarchicalSubject"]));
  const facts = collectFacts(tags, [
    ["颜色标签", ["Label"]],
    ["标题", ["Title", "Headline"]],
    ["说明", ["Description", "Caption-Abstract"]],
    ["收藏状态", ["Pick", "Marked"]],
  ]);
  setModule(elements.catalog, rating !== undefined || keywords.length > 0 || facts.length > 0);
  elements.rating.textContent = rating === undefined ? "" : `${"★".repeat(clamp(Math.round(rating), 0, 5))}${"☆".repeat(5 - clamp(Math.round(rating), 0, 5))}`;
  elements.keywordList.replaceChildren(...keywords.slice(0, 20).map((keyword) => {
    const chip = document.createElement("span"); chip.textContent = keyword; return chip;
  }));
  renderFactList(elements.catalogList, facts);
}

function renderRights(tags) {
  const facts = collectFacts(tags, [
    ["作者", ["Artist", "Creator", "By-line"]],
    ["版权", ["Copyright", "Rights"]],
    ["来源", ["Credit", "Source"]],
    ["使用条款", ["UsageTerms"]],
    ["版权状态", ["CopyrightStatus", "Marked"]],
  ]);
  setModule(elements.rights, facts.length > 0);
  renderFactList(elements.rightsList, facts);
}

function renderEquipment(tags) {
  const facts = collectFacts(tags, [
    ["制造商", ["Make"]],
    ["机身", ["Model", "CameraModelName"]],
    ["镜头", ["LensModel", "LensType"]],
    ["固件", ["Firmware", "FirmwareVersion"]],
  ]);
  for (const [label, names] of [["机身序列号", ["BodySerialNumber", "SerialNumber", "InternalSerialNumber"]], ["镜头序列号", ["LensSerialNumber"]]]) {
    const value = findRawTag(tags, names);
    if (value !== undefined) facts.push([label, maskIdentifier(formatValue(value))]);
  }
  setModule(elements.equipment, facts.length > 0);
  renderFactList(elements.equipmentList, facts);
}

function renderCoverage(tags) {
  const groups = ["EXIF", "IFD0", "GPS", "XMP", "IPTC", "ICC", "JFIF", "IHDR", "Photoshop"];
  elements.coverageGrid.replaceChildren(...groups.map((group) => {
    const count = Object.keys(tags).filter((key) => key.startsWith(`${group}:`) || key.startsWith(`${group}-`)).length;
    const item = document.createElement("div"); item.className = `coverage-item${count ? " is-present" : ""}`;
    const strong = document.createElement("strong"); strong.textContent = group;
    const span = document.createElement("span"); span.textContent = count ? `${count} 项` : "未记录";
    item.append(strong, span); return item;
  }));
}

function renderConflicts(tags) {
  const byName = new Map();
  for (const [key, value] of Object.entries(tags)) {
    const [group, ...parts] = key.split(":");
    const name = parts.join(":");
    if (!name || value === undefined || value === null || value === "") continue;
    const normalized = formatValue(value);
    const entries = byName.get(name) || [];
    entries.push({ group, value: normalized });
    byName.set(name, entries);
  }
  const conflicts = [...byName.entries()].filter(([, entries]) => new Set(entries.map((entry) => entry.value)).size > 1).slice(0, 8);
  setModule(elements.conflicts, conflicts.length > 0);
  elements.conflictList.replaceChildren(...conflicts.map(([name, entries]) => {
    const item = document.createElement("div"); item.className = "conflict-item";
    const strong = document.createElement("strong"); strong.textContent = name;
    const p = document.createElement("p"); p.textContent = entries.map((entry) => `${entry.group}: ${entry.value}`).join(" · ");
    item.append(strong, p); return item;
  }));
}

function renderStructure() {
  const counts = metadataRows.reduce((map, row) => map.set(row.group, (map.get(row.group) || 0) + 1), new Map());
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0) || 1;
  const colors = ["#8bbd2c", "#4b9dd1", "#e59943", "#ae73d4", "#3dab87", "#df6571", "#7f8e87", "#b39b45"];
  elements.structureBar.replaceChildren(...entries.map(([, count], index) => {
    const segment = document.createElement("span"); segment.className = "structure-segment";
    segment.style.width = `${count / total * 100}%`; segment.style.background = colors[index % colors.length]; return segment;
  }));
  elements.structureLegend.replaceChildren(...entries.map(([group, count], index) => {
    const item = document.createElement("span"); const dot = document.createElement("i");
    dot.style.background = colors[index % colors.length]; item.append(dot, `${group} ${count}`); return item;
  }));
}

async function renderEmbeddedThumbnail(file) {
  elements.thumbnailModule.hidden = true;
  if (thumbnailUrl?.startsWith("blob:")) URL.revokeObjectURL(thumbnailUrl);
  thumbnailUrl = undefined;
  try {
    thumbnailUrl = await window.exifr.thumbnailUrl(file);
    if (!thumbnailUrl) return;
    elements.embeddedThumbnail.src = thumbnailUrl;
    elements.thumbnailModule.hidden = false;
  } catch {
    elements.thumbnailModule.hidden = true;
  }
}

async function renderPixelAnalysis(file) {
  try {
    const source = await decodeImage(file);
    const scale = Math.min(1, 720 / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0, width, height);
    if (typeof source.close === "function") source.close();
    const pixels = context.getImageData(0, 0, width, height).data;
    const histogram = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    const buckets = new Map();
    for (let index = 0; index < pixels.length; index += 16) {
      if (pixels[index + 3] < 128) continue;
      const red = pixels[index], green = pixels[index + 1], blue = pixels[index + 2];
      histogram[0][red] += 1; histogram[1][green] += 1; histogram[2][blue] += 1;
      const key = `${red >> 5},${green >> 5},${blue >> 5}`;
      const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
      bucket.count += 1; bucket.red += red; bucket.green += green; bucket.blue += blue; buckets.set(key, bucket);
    }
    drawHistogram(histogram);
    renderPalette(selectPalette(buckets));
    elements.histogramStatus.hidden = true;
    elements.paletteStatus.hidden = true;
  } catch (error) {
    const message = `当前浏览器无法解码这张图片的像素：${error.message || "未知错误"}`;
    elements.histogramStatus.textContent = message;
    elements.paletteStatus.textContent = message;
  }
}

function drawHistogram(histogram) {
  const canvas = elements.histogramCanvas;
  const ratio = window.devicePixelRatio || 1;
  const cssWidth = Math.max(canvas.getBoundingClientRect().width, 300);
  const cssHeight = 210;
  canvas.width = Math.round(cssWidth * ratio); canvas.height = Math.round(cssHeight * ratio);
  const context = canvas.getContext("2d"); context.scale(ratio, ratio);
  const maximum = Math.max(...histogram.flatMap((channel) => [...channel])) || 1;
  const colors = ["#ff5f68", "#46c77b", "#5598ff"];
  context.lineWidth = 1.4; context.globalAlpha = 0.78;
  histogram.forEach((channel, channelIndex) => {
    context.beginPath(); context.strokeStyle = colors[channelIndex];
    channel.forEach((count, index) => {
      const x = index / 255 * cssWidth;
      const y = cssHeight - Math.sqrt(count / maximum) * (cssHeight - 6);
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
  });
}

function selectPalette(buckets) {
  const candidates = [...buckets.values()].sort((a, b) => b.count - a.count).map((bucket) => ({
    count: bucket.count,
    red: Math.round(bucket.red / bucket.count), green: Math.round(bucket.green / bucket.count), blue: Math.round(bucket.blue / bucket.count),
  }));
  const selected = [];
  for (const candidate of candidates) {
    if (selected.every((color) => Math.hypot(color.red - candidate.red, color.green - candidate.green, color.blue - candidate.blue) > 48)) selected.push(candidate);
    if (selected.length === 6) break;
  }
  return selected;
}

function renderPalette(colors) {
  elements.palette.replaceChildren(...colors.map((color) => {
    const hex = `#${[color.red, color.green, color.blue].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    const swatch = document.createElement("div"); swatch.className = "swatch"; swatch.style.background = hex;
    const label = document.createElement("span"); label.textContent = hex; swatch.append(label); return swatch;
  }));
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图像格式不受支持")); };
    image.src = url;
  });
}

function renderPrivacy(tags) {
  const gpsLat = findTag(tags, ["GPSLatitude"]);
  const gpsLon = findTag(tags, ["GPSLongitude"]);
  const serials = findMatches(tags, /(?:SerialNumber|InternalSerialNumber)$/i);
  const people = findMatches(tags, /(?:Artist|Creator|OwnerName|By-line|Copyright)$/i, ["ICC"]);
  const documentIds = findMatches(tags, /(?:DocumentID|InstanceID|OriginalDocumentID)$/i);
  const editTags = Object.keys(tags).filter((key) => /^(?:XMP(?:-|:)|Photoshop:)/i.test(key));
  const findings = [];

  if (gpsLat && gpsLon) {
    findings.push({ level: "danger", title: "包含 GPS 坐标", detail: `${gpsLat}, ${gpsLon}` });
  } else {
    findings.push({ level: "ok", title: "未发现 GPS 坐标", detail: "文件中没有可用的经纬度信息。" });
  }

  if (serials.length) {
    findings.push({ level: "warn", title: "包含设备序列号", detail: summarizeMatches(serials) });
  } else {
    findings.push({ level: "ok", title: "未发现设备序列号", detail: "没有检测到机身或镜头序列号。" });
  }

  if (people.length) {
    findings.push({ level: "warn", title: "包含作者或版权信息", detail: summarizeMatches(people) });
  } else {
    findings.push({ level: "ok", title: "未发现署名信息", detail: "没有检测到作者、所有者或版权字段。" });
  }

  if (editTags.length || documentIds.length) {
    findings.push({ level: "warn", title: "包含编辑与文档记录", detail: `${editTags.length} 个 XMP/Photoshop 标签${documentIds.length ? `，${documentIds.length} 个文档标识符` : ""}。` });
  } else {
    findings.push({ level: "ok", title: "未发现编辑记录", detail: "没有检测到 XMP 或 Photoshop 编辑信息。" });
  }

  const riskCount = findings.filter((item) => item.level !== "ok").length;
  elements.privacyScore.textContent = riskCount ? `${riskCount} 项需留意` : "未见明显风险";
  elements.privacyList.replaceChildren(...findings.map((item) => {
    const container = document.createElement("div");
    container.className = `privacy-item ${item.level}`;
    const marker = document.createElement("span");
    marker.className = "privacy-marker";
    marker.setAttribute("aria-hidden", "true");
    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.title;
    const detail = document.createElement("p");
    detail.textContent = item.detail;
    content.append(title, detail);
    container.append(marker, content);
    return container;
  }));
}

function renderSummary(tags) {
  const hasCamera = findRawTag(tags, ["Model", "CameraModelName"]) !== undefined;
  const hasLens = findRawTag(tags, ["LensModel", "LensType"]) !== undefined;
  const hasEdits = Object.keys(tags).some((key) => /^(?:XMP-crs:|Photoshop:)/i.test(key));
  const hasGps = findRawTag(tags, ["latitude", "GPSLatitude"]) !== undefined && findRawTag(tags, ["longitude", "GPSLongitude"]) !== undefined;
  const hasIcc = Object.keys(tags).some((key) => key.startsWith("ICC:"));
  const hasThumbnail = Object.keys(tags).some((key) => key.startsWith("IFD1:"));
  const hasRights = findRawTag(tags, ["Artist", "Creator", "Copyright", "Rights"]) !== undefined;
  const items = [
    ["相机与镜头", hasCamera || hasLens ? [hasCamera, hasLens].filter(Boolean).length === 2 ? "已记录机身和镜头" : "已记录部分设备信息" : "未记录设备信息", hasCamera || hasLens],
    ["Adobe 编辑记录", hasEdits ? "包含 Lightroom / Camera Raw 调整" : "未发现 Adobe 调整参数", hasEdits],
    ["定位信息", hasGps ? "包含 GPS 坐标，分享前建议确认" : "未记录 GPS 坐标", hasGps, hasGps ? "warn" : "ok"],
    ["色彩配置", hasIcc ? "包含 ICC 色彩配置" : "未嵌入 ICC 配置", hasIcc],
    ["内置缩略图", hasThumbnail ? "包含文件内预览图" : "未发现内置缩略图", hasThumbnail],
    ["版权署名", hasRights ? "包含作者或版权字段" : "未记录署名信息", hasRights],
  ];
  elements.summaryList.replaceChildren(...items.map(([title, detail, present, level]) => {
    const item = document.createElement("div");
    item.className = `summary-item ${level || (present ? "present" : "absent")}`;
    const marker = document.createElement("span"); marker.className = "summary-marker"; marker.setAttribute("aria-hidden", "true");
    const content = document.createElement("div");
    const strong = document.createElement("strong"); strong.textContent = title;
    const paragraph = document.createElement("p"); paragraph.textContent = detail;
    content.append(strong, paragraph); item.append(marker, content); return item;
  }));
}

function renderGroupOptions() {
  const current = elements.groupFilter.value;
  const groups = [...new Set(metadataRows.map((row) => row.group))].sort();
  const base = document.createElement("option");
  base.value = "";
  base.textContent = "全部分组";
  const options = groups.map((group) => {
    const option = document.createElement("option");
    option.value = group;
    option.textContent = group;
    return option;
  });
  elements.groupFilter.replaceChildren(base, ...options);
  if (groups.includes(current)) elements.groupFilter.value = current;
}

function renderRows() {
  const query = elements.search.value.trim().toLowerCase();
  const group = elements.groupFilter.value;
  const filtered = metadataRows.filter((row) => (!group || row.group === group) && (!query || row.searchable.includes(query)));
  elements.metadataBody.replaceChildren(...filtered.map((row) => {
    const tr = document.createElement("tr");
    for (const [index, value] of [row.group, row.tag, row.displayValue].entries()) {
      const td = document.createElement("td");
      if (index === 2 && value.length > 320) {
        const details = document.createElement("details");
        details.className = "structured-value";
        const summary = document.createElement("summary");
        summary.textContent = `查看结构化数据 · ${value.length.toLocaleString("zh-CN")} 字符`;
        const pre = document.createElement("pre");
        pre.textContent = value;
        details.append(summary, pre);
        td.append(details);
      } else {
        td.textContent = value;
      }
      tr.append(td);
    }
    return tr;
  }));
  elements.emptyFilter.hidden = filtered.length !== 0;
}

function setModule(element, visible) {
  element.hidden = !visible;
}

function findRawTag(tags, names) {
  for (const name of names) {
    const candidates = Object.entries(tags).filter(([key, value]) => key.split(":").pop() === name && value !== undefined && value !== null && value !== "");
    const preferred = candidates.find(([key]) => key.startsWith("EXIF:")) || candidates.find(([key]) => key.startsWith("XMP-")) || candidates.find(([key]) => key.startsWith("XMP:")) || candidates.find(([key]) => key.startsWith("IFD0:")) || candidates[0];
    if (preferred) return preferred[1];
  }
}

function collectFacts(tags, definitions) {
  const facts = [];
  for (const [label, names] of definitions) {
    const value = findRawTag(tags, names);
    if (value !== undefined) facts.push([label, formatValue(value)]);
  }
  return facts;
}

function makeFact(label, value) {
  const item = document.createElement("div"); item.className = "fact";
  const name = document.createElement("span"); name.textContent = label;
  const strong = document.createElement("strong"); strong.textContent = value;
  item.append(name, strong); return item;
}

function renderFactList(container, facts) {
  const list = document.createElement("dl"); list.className = container.className;
  list.replaceChildren(...facts.map(([label, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt"); term.textContent = label;
    const detail = document.createElement("dd"); detail.textContent = value;
    row.append(term, detail); return row;
  }));
  container.replaceChildren(...list.children);
}

function makeAdjustment(label, value, minimum, maximum) {
  const row = document.createElement("div"); row.className = "adjustment-row";
  const name = document.createElement("label"); name.textContent = label;
  const track = document.createElement("div"); track.className = "adjustment-track";
  const fill = document.createElement("span"); fill.className = "adjustment-fill";
  const position = clamp((value - minimum) / (maximum - minimum) * 100, 0, 100);
  const zero = clamp((0 - minimum) / (maximum - minimum) * 100, 0, 100);
  fill.style.left = `${Math.min(position, zero)}%`; fill.style.width = `${Math.abs(position - zero)}%`;
  track.append(fill);
  const output = document.createElement("output"); output.textContent = `${value > 0 ? "+" : ""}${formatNumber(value)}`;
  row.append(name, track, output); return row;
}

function parseCurve(value) {
  if (!value) return [];
  const source = Array.isArray(value) ? value : String(value).split(/[;|]/);
  return source.map((point) => {
    if (Array.isArray(point)) return point.map(Number).slice(0, 2);
    if (typeof point === "object") return [Number(point.x ?? point.input), Number(point.y ?? point.output)];
    const values = String(point).match(/-?\d+(?:\.\d+)?/g)?.map(Number);
    return values?.slice(0, 2);
  }).filter((point) => point?.length === 2 && point.every(Number.isFinite));
}

function drawToneCurve(points) {
  elements.toneCurve.replaceChildren();
  if (points.length < 2) return;
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", points.map(([x, y]) => `${clamp(x, 0, 255)},${160 - clamp(y, 0, 255) / 255 * 160}`).join(" "));
  polyline.setAttribute("fill", "none"); polyline.setAttribute("stroke", "currentColor"); polyline.setAttribute("stroke-width", "3");
  polyline.setAttribute("stroke-linecap", "round"); polyline.setAttribute("stroke-linejoin", "round");
  elements.toneCurve.append(polyline);
}

function makeHslRow(label, value, color) {
  const row = document.createElement("div"); row.className = "hsl-row"; row.style.color = color;
  const name = document.createElement("span"); name.textContent = label; name.style.color = "var(--text)";
  const track = document.createElement("div"); track.className = "hsl-track";
  const marker = document.createElement("i"); marker.style.left = `${clamp((value + 100) / 2, 0, 100)}%`; track.append(marker);
  const number = document.createElement("span"); number.textContent = `${value > 0 ? "+" : ""}${formatNumber(value)}`;
  row.append(name, track, number); return row;
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (match) return Number(match[0]);
  }
}

function formatNumber(value) {
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function greatestCommonDivisor(a, b) {
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function normalizeList(value) {
  if (value === undefined || value === null || value === "") return [];
  const values = Array.isArray(value) ? value.flat(Infinity) : String(value).split(/[;,|]/);
  return [...new Set(values.map((item) => formatValue(item).trim()).filter(Boolean))];
}

function maskIdentifier(value) {
  if (value.length <= 4) return "••••";
  return `${"•".repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

function findTag(tags, names) {
  for (const name of names) {
    const candidates = Object.entries(tags).filter(([key, value]) => key.split(":").pop() === name && value !== undefined && value !== null && value !== "");
    const preferred = candidates.find(([key]) => key.startsWith("EXIF:")) || candidates.find(([key]) => key.startsWith("IFD0:")) || candidates[0];
    if (preferred) return formatValue(preferred[1]);
  }
}

function findMatches(tags, pattern, excludedGroups = []) {
  const matches = Object.entries(tags)
    .filter(([key, value]) => !excludedGroups.includes(key.split(":")[0]) && pattern.test(key.split(":").pop()) && value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ({ key: key.split(":").pop(), value: formatValue(value) }));
  return [...new Map(matches.map((item) => [`${item.key}:${item.value}`, item])).values()];
}

function summarizeMatches(matches) {
  return matches.slice(0, 3).map((item) => `${item.key}: ${item.value}`).join("；") + (matches.length > 3 ? `；另有 ${matches.length - 3} 项` : "");
}

function formatValue(value) {
  if (value instanceof Date) return value.toLocaleString("zh-CN", { hour12: false });
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (ArrayBuffer.isView(value)) return `${value.constructor.name} · ${value.byteLength} 字节`;
  if (typeof value === "object") {
    if (value.rawValue) return value.rawValue + (value.zoneName ? ` ${value.zoneName}` : "");
    if (value.description) return value.description;
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function formatAperture(value) {
  if (!value || value === "—") return "—";
  return /^f\//i.test(value) ? value : `f/${value}`;
}

function formatShutter(value) {
  if (!value) return "—";
  if (String(value).includes("/")) return String(value);
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return String(value);
  if (seconds >= 1) return `${seconds} s`;
  return `1/${Math.round(1 / seconds)}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "大小未知";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("is-error", isError);
}

function flattenMetadata(parsed, file, dimensions) {
  const extension = file.name.includes(".") ? file.name.split(".").pop().toUpperCase() : "未知";
  const tags = {
    "File:FileName": file.name,
    "File:FileType": extension,
    "File:MIMEType": file.type || "未知",
    "File:FileSize": formatBytes(file.size),
    "File:LastModified": new Date(file.lastModified),
  };

  if (dimensions) {
    tags["File:ImageWidth"] = dimensions.width;
    tags["File:ImageHeight"] = dimensions.height;
  }

  for (const [rawGroup, block] of Object.entries(parsed)) {
    const group = formatGroupName(rawGroup);
    if (isPlainObject(block)) {
      for (const [tag, value] of Object.entries(block)) tags[`${group}:${tag}`] = value;
    } else {
      tags[`Metadata:${group}`] = block;
    }
  }
  return tags;
}

function formatGroupName(group) {
  const names = {
    ifd0: "IFD0",
    ifd1: "IFD1",
    exif: "EXIF",
    gps: "GPS",
    interop: "Interop",
    iptc: "IPTC",
    icc: "ICC",
    jfif: "JFIF",
    ihdr: "IHDR",
    xmp: "XMP",
    photoshop: "Photoshop",
  };
  return names[group] || `XMP-${group}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !ArrayBuffer.isView(value);
}

async function getImageDimensions(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return undefined;
  }
}
