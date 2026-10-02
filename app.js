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
  tagTotal: document.querySelector("#tag-total"),
  privacyScore: document.querySelector("#privacy-score"),
  privacyList: document.querySelector("#privacy-list"),
  groupChart: document.querySelector("#group-chart"),
  search: document.querySelector("#search"),
  groupFilter: document.querySelector("#group-filter"),
  metadataBody: document.querySelector("#metadata-body"),
  emptyFilter: document.querySelector("#empty-filter"),
  engine: document.querySelector("#engine"),
  chooseAnother: document.querySelector("#choose-another"),
};

let metadataRows = [];
let previewUrl;

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
    const parsed = await window.exifr.parse(file, {
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
    });
    if (!parsed) throw new Error("没有在这个文件中找到可读取的元数据。");
    const dimensions = await getImageDimensions(file);
    const result = {
      file: { name: file.name, size: file.size, type: file.type },
      tags: flattenMetadata(parsed, file, dimensions),
      engine: "由 exifr 7.1.3 提供元数据解析",
    };
    renderResult(result, file);
    setStatus("");
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
  elements.tagTotal.textContent = `${metadataRows.length} 个可读标签 · ${new Set(metadataRows.map((row) => row.group)).size} 个分组`;
  elements.engine.textContent = result.engine;
  elements.previewFallback.textContent = String(fileType).slice(0, 5);

  renderPreview(file);
  renderPrivacy(tags);
  renderGroupChart();
  renderGroupOptions();
  renderRows();

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

function renderGroupChart() {
  const counts = metadataRows.reduce((map, row) => map.set(row.group, (map.get(row.group) || 0) + 1), new Map());
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maximum = entries[0]?.[1] || 1;
  elements.groupChart.replaceChildren(...entries.map(([group, count]) => {
    const row = document.createElement("div");
    row.className = "group-row";
    const name = document.createElement("span");
    name.className = "group-name";
    name.title = group;
    name.textContent = group;
    const track = document.createElement("div");
    track.className = "group-track";
    const bar = document.createElement("div");
    bar.className = "group-bar";
    bar.style.width = `${Math.max(3, (count / maximum) * 100)}%`;
    track.append(bar);
    const number = document.createElement("span");
    number.className = "group-count";
    number.textContent = count;
    row.append(name, track, number);
    return row;
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
