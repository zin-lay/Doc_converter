(() => {
  const $ = id => document.getElementById(id);
  let file = null, fmt = "png", caps = null, busy = false;

  // ---- format chips
  document.querySelectorAll("#fmt .chip").forEach(c => c.onclick = () => {
    fmt = c.dataset.v;
    document.querySelectorAll("#fmt .chip").forEach(x => x.setAttribute("aria-pressed", x === c));
    $("qualityField").hidden = fmt !== "jpg";
  });
  $("quality").oninput = () => { $("qval").textContent = $("quality").value; };

  // ---- file choosing
  const drop = $("drop"), input = $("file");
  drop.onclick = () => input.click();
  drop.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); };
  input.onchange = () => { if (input.files[0]) pick(input.files[0]); input.value = ""; };
  $("clear").onclick = () => { file = null; $("docName").textContent = "No file chosen"; $("clear").hidden = true; refresh(); };

  function pick(f) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (caps && !caps.accept.includes(ext)) {
      setNotice(`Can't convert ".${ext}". Supported here: ${caps.accept.join(", ")}.`);
      return;
    }
    setNotice("");
    file = f;
    $("docName").innerHTML = ""; const b = document.createElement("b"); b.textContent = f.name; $("docName").append(b);
    $("docName").append(document.createTextNode("  ·  " + fmtBytes(f.size)));
    $("clear").hidden = false;
    refresh();
  }
  function refresh() { $("go").disabled = !file || !caps || !caps.engines.poppler || busy; }

  // ---- convert
  $("go").onclick = async () => {
    if (!file) return;
    busy = true; refresh();
    const gal = $("gallery"); gal.innerHTML = "";
    $("dlZip").hidden = true; $("dlZip").disabled = true;
    setProg(0.08); setStatus("Rendering pages… this runs locally and can take a moment for large files.");
    try {
      const q = new URLSearchParams({ name: file.name, format: fmt, dpi: $("dpi").value, pages: $("pages").value.trim() });
      if (fmt === "jpg") q.set("quality", $("quality").value);
      const res = await fetch("/api/convert?" + q.toString(), {
        method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file
      });
      const data = await res.json().catch(() => ({ error: "Unexpected server response." }));
      if (!res.ok) throw new Error(data.error || `Conversion failed (HTTP ${res.status}).`);
      setProg(1); setStatus(`${data.count} image${data.count === 1 ? "" : "s"} at ${data.dpi} DPI.`);
      renderGallery(data);
    } catch (e) {
      setStatus(e.message || "Conversion failed.", true);
      gal.innerHTML = '<p class="empty">No images produced.</p>';
    } finally { setProg(null); busy = false; refresh(); }
  };

  function renderGallery(data) {
    const gal = $("gallery"); gal.innerHTML = "";
    data.pages.forEach((p, i) => {
      const card = document.createElement("div"); card.className = "card";
      const a = document.createElement("a"); a.className = "thumb"; a.href = p.url; a.target = "_blank"; a.rel = "noopener";
      const img = document.createElement("img"); img.loading = "lazy"; img.src = p.url; img.alt = `Page ${i + 1}`;
      a.append(img);
      const cap = document.createElement("div"); cap.className = "cap";
      const label = document.createElement("b"); label.textContent = "Page " + (i + 1);
      const dl = document.createElement("a"); dl.className = "dl"; dl.href = p.url; dl.download = p.name; dl.textContent = "Save";
      cap.append(label, dl);
      card.append(a, cap); gal.append(card);
    });
    if (data.count > 1) {
      const z = $("dlZip"); z.hidden = false; z.disabled = false;
      z.onclick = () => { const a = document.createElement("a"); a.href = data.zipUrl; a.download = ""; document.body.append(a); a.click(); a.remove(); };
    }
  }

  // ---- helpers
  function setStatus(msg, err) { $("status").textContent = msg || ""; $("status").classList.toggle("err", !!err); }
  function setNotice(msg) { $("notice").textContent = msg || ""; $("notice").hidden = !msg; }
  function setProg(p) { $("prog").style.display = p == null ? "none" : "block"; $("prog").firstElementChild.style.width = (p || 0) * 100 + "%"; }
  function fmtBytes(n) { return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB"; }

  // ---- startup: discover engines
  (async () => {
    const badge = $("engine");
    try {
      caps = await (await fetch("/api/config")).json();
      if (!caps.engines.poppler) {
        badge.textContent = "Engine missing"; badge.classList.add("bad");
        setNotice("The PDF engine (Poppler) isn't installed on the server, so no conversions can run. Install poppler-utils and restart the app.");
      } else if (!caps.engines.libreoffice) {
        badge.textContent = "PDF only";
        $("accept").textContent = "PDF  (install LibreOffice to add Word & PowerPoint)";
        input.accept = ".pdf";
      } else {
        badge.textContent = "PDF · Word · PowerPoint";
        input.accept = ".pdf,.doc,.docx,.odt,.rtf,.ppt,.pptx,.odp,.xls,.xlsx,.ods";
      }
    } catch {
      badge.textContent = "Server offline"; badge.classList.add("bad");
      setNotice("Can't reach the app server. Start it with: npm start");
    }
    refresh();
  })();
})();
