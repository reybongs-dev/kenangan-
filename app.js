const THEME_KEY = "ruang_kenangan_theme_v1";
    const DB_NAME = "RuangKenanganDB_v3";
    const STORE_NAME = "memories";
    const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
    const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
    const ALLOWED_FRAMES = ["polaroid-tilt", "scrapbook-collage", "romance-classic"];
    const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/wav", "audio/webm"];
    const ALLOWED_SPOTIFY_HOSTS = [
      "open.spotify.com"
    ];

    const navInputBtn = document.getElementById("navInputBtn");
    const navGalleryBtn = document.getElementById("navGalleryBtn");
    const backToInputBtn = document.getElementById("backToInputBtn");
    const inputPage = document.getElementById("inputPage");
    const galleryPage = document.getElementById("galleryPage");
    const navCountEl = document.getElementById("navCount");

    const form = document.getElementById("memoryForm");
    const titleInput = document.getElementById("titleInput");
    const dateInput = document.getElementById("dateInput");
    const groupInput = document.getElementById("groupInput");
    const groupSuggestionsEl = document.getElementById("groupSuggestions");
    const frameStyleInput = document.getElementById("frameStyleInput");
    const noteInput = document.getElementById("noteInput");
    const storyInput = document.getElementById("storyInput");
    const photoInput = document.getElementById("photoInput");
    const audioInput = document.getElementById("audioInput");
    const spotifyUrlInput = document.getElementById("spotifyUrlInput");

    const searchInput = document.getElementById("searchInput");
    const groupFilterSelect = document.getElementById("groupFilterSelect");
    const groupedCollageContainer = document.getElementById("groupedCollageContainer");

    const totalMemoriesEl = document.getElementById("totalMemories");
    const totalGroupsEl = document.getElementById("totalGroups");
    const networkIconEl = document.getElementById("networkIcon");
    const networkStatusValueEl = document.getElementById("networkStatusValue");
    const statusInfoEl = document.getElementById("statusInfo");
    const themeToggleBtn = document.getElementById("themeToggle");

    const detailModal = document.getElementById("detailModal");
    const closeModalBtn = document.getElementById("closeModalBtn");
    const modalGroupBadge = document.getElementById("modalGroupBadge");
    const modalTitle = document.getElementById("modalTitle");
    const modalDate = document.getElementById("modalDate");
    const modalBody = document.getElementById("modalBody");

    let db = null;
    let memories = [];
    let activeObjectUrls = [];
    let modalObjectUrls = [];
    const viewModeCollageBtn = document.getElementById("viewModeCollageBtn");
    const viewModePhotoGridBtn = document.getElementById("viewModePhotoGridBtn");

    let searchQuery = "";
    let selectedGroupFilter = "ALL";
    let galleryViewMode = "collage";
    let editingId = "";
    let isSaving = false;

    function switchPage(targetPageId) {
      const showGallery = targetPageId === "galleryPage";
      inputPage.hidden = showGallery;
      galleryPage.hidden = !showGallery;
      navInputBtn.classList.toggle("active", !showGallery);
      navGalleryBtn.classList.toggle("active", showGallery);
      if (showGallery) render();
    }

    function updateNetworkUI() {
      const online = navigator.onLine;
      networkIconEl.textContent = online ? "🟢" : "🟠";
      networkStatusValueEl.textContent = online ? "Online" : "Offline";
      if (!galleryPage.hidden) render();
      if (!detailModal.hidden) closeDetailModal();
    }

    function normalizeMemoryRow(row) {
      return {
        id: String(row.id || ""),
        title: String(row.title || ""),
        date: String(row.date || ""),
        groupName: String(row.group_name || row.groupName || "Kenangan Umum"),
        frameStyle: sanitizeFrameStyle(row.frame_style || row.frameStyle),
        note: String(row.note || ""),
        story: String(row.story || ""),
        photoBlob: row.photoBlob || (Array.isArray(row.collageItems) && row.collageItems[0]?.blob) || null,
        audioBlob: row.audioBlob || null,
        audioName: String(row.audio_name || row.audioName || ""),
        clipDurationSec: Math.min(40, Math.max(1, Number(row.clip_duration_sec || row.clipDurationSec || 40) || 40)),
        lyricsSnippet: String(row.lyrics_snippet || row.lyricsSnippet || ""),
        trackMetaTitle: String(row.track_meta_title || row.trackMetaTitle || ""),
        trackMetaArtist: String(row.track_meta_artist || row.trackMetaArtist || ""),
        spotifyTrackId: String(row.spotify_track_id || row.spotifyTrackId || "")
      };
    }

    function revokeActiveUrls() {
      activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
      activeObjectUrls = [];
    }

    function revokeModalUrls() {
      modalObjectUrls.forEach((url) => URL.revokeObjectURL(url));
      modalObjectUrls = [];
    }

    function createSafeObjectUrl(blob, pool = activeObjectUrls) {
      if (!blob || !(blob instanceof Blob)) return "";
      const url = URL.createObjectURL(blob);
      pool.push(url);
      return url;
    }

    function sanitizeHttpsUrl(rawUrl) {
      try {
        const u = new URL(String(rawUrl || "").trim());
        return u.protocol === "https:" ? u.href : "";
      } catch {
        return "";
      }
    }

    function openDB() {
      return new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
          reject(new Error("IndexedDB tidak didukung"));
          return;
        }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const database = e.target.result;
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            database.createObjectStore(STORE_NAME, { keyPath: "id" });
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => reject(req.error);
      });
    }

    function ensureDBReady() {
      if (!db) {
        statusInfoEl.textContent = "⚠️ Penyimpanan lokal belum siap, coba muat ulang";
        return false;
      }
      return true;
    }

    function getAllMemories() {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => reject(req.error);
      });
    }

    function putMemory(item) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(item);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    function deleteMemoryById(id) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    function applyTheme(theme) {
      const safeTheme = theme === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", safeTheme);
      themeToggleBtn.textContent = safeTheme === "dark" ? "☀️ Mode Terang" : "🌙 Mode Gelap";
      try {
        localStorage.setItem(THEME_KEY, safeTheme);
      } catch {
        // Abaikan jika penyimpanan tema diblokir
      }
    }

    function escapeHtml(text) {
      return String(text || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function isSafeId(id) {
      return /^[0-9]{1,20}$/.test(String(id || ""));
    }

    function sanitizeFrameStyle(mode) {
      return ALLOWED_FRAMES.includes(mode) ? mode : "polaroid-tilt";
    }

    function extractValidSpotifyTrackId(rawUrl) {
      const trimmed = String(rawUrl || "").trim();
      if (!trimmed) return { valid: true, trackId: "" };

      let parsed;
      try {
        parsed = new URL(trimmed);
      } catch {
        return { valid: false, error: "⚠️ Format link Spotify tidak valid" };
      }

      if (parsed.protocol !== "https:") {
        return { valid: false, error: "⚠️ Link Spotify wajib menggunakan HTTPS" };
      }

      if (parsed.username || parsed.password) {
        return { valid: false, error: "⚠️ Link mencurigakan ditolak demi keamanan" };
      }

      const host = parsed.hostname.toLowerCase();
      if (!ALLOWED_SPOTIFY_HOSTS.includes(host)) {
        return {
          valid: false,
          error: "⚠️ Ditolak: Hanya menerima domain resmi open.spotify.com"
        };
      }

      // Mendukung path /track/<id> atau /intl-xx/track/<id> (khusus lagu / track)
      const parts = parsed.pathname.split("/").filter(Boolean);
      const trackIdx = parts.indexOf("track");
      if (trackIdx === -1 || !parts[trackIdx + 1]) {
        return {
          valid: false,
          error: "⚠️ Hanya menerima link lagu (track) Spotify, bukan playlist/album/profil"
        };
      }

      const candidateId = parts[trackIdx + 1];
      if (!/^[a-zA-Z0-9]{22}$/.test(candidateId)) {
        return {
          valid: false,
          error: "⚠️ ID lagu Spotify tidak valid"
        };
      }

      return { valid: true, trackId: candidateId };
    }

    function compressImageBlob(file, maxSide = 1280, quality = 0.8) {
      return new Promise((resolve) => {
        if (!file || !(file instanceof Blob) || file.type === "image/gif") {
          resolve(file);
          return;
        }
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          let { width, height } = img;
          if (width > maxSide || height > maxSide) {
            if (width >= height) {
              height = Math.round((height * maxSide) / width);
              width = maxSide;
            } else {
              width = Math.round((width * maxSide) / height);
              height = maxSide;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(file);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob || blob.size >= file.size) {
                resolve(file);
              } else {
                resolve(blob);
              }
            },
            "image/jpeg",
            quality
          );
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(file);
        };
        img.src = url;
      });
    }

    function validateMediaFiles(photoFile, audioFile) {
      if (photoFile) {
        const pType = String(photoFile.type || "").toLowerCase();
        if (!ALLOWED_IMAGE_TYPES.includes(pType)) {
          return "⚠️ Format foto harus JPG, PNG, WebP, atau GIF";
        }
        if (photoFile.size > MAX_PHOTO_BYTES) {
          return "⚠️ Ukuran foto melebihi 8 MB";
        }
      }
      if (audioFile) {
        const aType = String(audioFile.type || "").toLowerCase();
        if (!ALLOWED_AUDIO_TYPES.includes(aType) && !aType.startsWith("audio/")) {
          return "⚠️ File lagu harus berupa format audio yang valid";
        }
        if (audioFile.size > MAX_AUDIO_BYTES) {
          return "⚠️ Ukuran lagu melebihi 20 MB";
        }
      }
      return "";
    }

    function syncGroupSelectors() {
      const groups = Array.from(
        new Set(memories.map((m) => (m.groupName || "Kenangan Umum").trim()))
      ).sort((a, b) => a.localeCompare(b, "id"));

      totalMemoriesEl.textContent = `${memories.length} momen`;
      totalGroupsEl.textContent = `${groups.length} grup`;
      navCountEl.textContent = String(memories.length);

      groupSuggestionsEl.innerHTML = groups
        .map((g) => `<option value="${escapeHtml(g)}"></option>`)
        .join("");

      const prevValue = groupFilterSelect.value || "ALL";
      groupFilterSelect.innerHTML =
        `<option value="ALL">Semua Kelompok (${groups.length})</option>` +
        groups.map((g) => `<option value="${escapeHtml(g)}">📂 ${escapeHtml(g)}</option>`).join("");

      if (prevValue === "ALL" || groups.includes(prevValue)) {
        groupFilterSelect.value = prevValue;
      } else {
        groupFilterSelect.value = "ALL";
        selectedGroupFilter = "ALL";
      }
    }


    function renderAudioBlock(item, localAudioUrl) {
      const maxCapSec = Math.min(40, Math.max(1, Number(item.clipDurationSec || 40) || 40));
      const lyricHtml = item.lyricsSnippet && item.lyricsSnippet.trim()
        ? `<blockquote class="memory-lyric-quote">🎼 "${escapeHtml(item.lyricsSnippet.trim())}"</blockquote>`
        : "";
      const metaLabel = (item.trackMetaTitle || item.trackMetaArtist)
        ? ` · ${escapeHtml([item.trackMetaTitle, item.trackMetaArtist].filter(Boolean).join(" — "))}`
        : "";

      const playableAudio = localAudioUrl;
      if (playableAudio) {
        const label = "Potongan Audio";
        return `
          <div class="song-box">
            <span class="song-title">🎶 ${label} (Maks. ${maxCapSec} dtk): ${escapeHtml(item.audioName || "Audio")}${metaLabel}</span>
            <audio class="capped-audio" data-max-sec="${maxCapSec}" controls preload="metadata" src="${escapeHtml(playableAudio)}"></audio>
            ${lyricHtml}
          </div>
        `;
      }

      const trackId = item.spotifyTrackId || item.youtubeId;
      if (trackId && /^[a-zA-Z0-9]{22}$/.test(trackId)) {
        if (!navigator.onLine) {
          return `
            <div class="song-box">
              <span class="song-title">🎧 Lagu Spotify${metaLabel}</span>
              <div class="offline-audio-note">🟠 Mode Offline: Pemutar Spotify dinonaktifkan sementara agar tidak membebani atau mengacaukan cache offline.</div>
              ${lyricHtml}
            </div>
          `;
        }

        const embedSrc = `https://open.spotify.com/embed/track/${trackId}?utm_source=generator`;
        const openUrl = `https://open.spotify.com/track/${trackId}`;
        return `
          <div class="song-box">
            <div class="song-meta-row">
              <span class="song-title">🎧 Lagu Spotify (Maks. ${maxCapSec} dtk)${metaLabel}</span>
              <a class="spotify-external-link" href="${escapeHtml(openUrl)}" target="_blank" rel="noopener noreferrer">Buka di Spotify ↗</a>
            </div>
            <iframe
              class="spotify-frame"
              src="${escapeHtml(embedSrc)}"
              title="Pemutar lagu Spotify"
              loading="lazy"
              referrerpolicy="strict-origin-when-cross-origin"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            ></iframe>
            ${lyricHtml}
          </div>
        `;
      }

      if (lyricHtml) {
        return `<div class="song-box">${lyricHtml}</div>`;
      }

      return "";
    }

    function openDetailModal(id) {
      const item = memories.find((m) => m.id === id);
      if (!item || !isSafeId(item.id)) return;

      revokeModalUrls();
      const photoUrl = createSafeObjectUrl(item.photoBlob, modalObjectUrls);
      const localAudioUrl = createSafeObjectUrl(item.audioBlob, modalObjectUrls);
      const safeFrame = sanitizeFrameStyle(item.frameStyle);
      const frameNote = item.note && item.note.trim()
        ? `🤍 "${escapeHtml(item.note.trim())}"`
        : `🤍 Selalu bikin rindu • ${escapeHtml(item.date)}`;

      modalGroupBadge.textContent = `📂 ${item.groupName || "Kenangan Umum"}`;
      modalTitle.textContent = `🌷 ${item.title}`;
      modalDate.textContent = `🗓️ ${item.date}`;

      modalBody.innerHTML = `
        ${
          photoUrl
            ? `
          <div class="photo-frame-wrap">
            <div class="photo-frame ${safeFrame}">
              <img class="memory-photo" src="${escapeHtml(photoUrl)}" alt="${escapeHtml(item.title)}" />
              <div class="frame-caption">${frameNote}</div>
            </div>
          </div>
        `
            : ""
        }
        <p class="memory-story">${escapeHtml(item.story)}</p>
        ${renderAudioBlock(item, localAudioUrl)}
      `;

      detailModal.hidden = false;
    }

    function closeDetailModal() {
      detailModal.hidden = true;
      modalBody.innerHTML = "";
      revokeModalUrls();
    }

    function render() {
      revokeActiveUrls();
      syncGroupSelectors();

      const q = searchQuery.trim().toLowerCase();
      const filtered = [...memories]
        .filter((item) => isSafeId(item.id))
        .sort((a, b) => Number(b.id) - Number(a.id))
        .filter((item) => {
          const itemGroup = (item.groupName || "Kenangan Umum").trim();
          if (selectedGroupFilter !== "ALL" && itemGroup !== selectedGroupFilter) {
            return false;
          }
          if (!q) return true;
          const haystack = [
            item.title,
            item.story,
            item.note,
            item.date,
            itemGroup,
            item.lyricsSnippet,
            item.trackMetaTitle,
            item.trackMetaArtist
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        });

      if (memories.length === 0) {
        if (searchQuery) {
          searchQuery = "";
          searchInput.value = "";
        }
        groupedCollageContainer.innerHTML = `
          <div class="empty-state">
            🌸 Belum ada kenangan tersimpan.<br/>
            Silakan isi kenangan pertama di <strong>Halaman 1 · Isi Kenangan</strong>.
          </div>
        `;
        return;
      }

      if (filtered.length === 0) {
        groupedCollageContainer.innerHTML = `
          <div class="empty-state">
            🔍 Tidak ada kenangan yang cocok dengan filter atau pencarian saat ini.
          </div>
        `;
        return;
      }

      if (galleryViewMode === "photogrid") {
        const photoItems = filtered
          .map((item) => ({
            item,
            photoUrl: createSafeObjectUrl(item.photoBlob)
          }))
          .filter((entry) => Boolean(entry.photoUrl));

        if (photoItems.length === 0) {
          groupedCollageContainer.innerHTML = `
            <div class="empty-state">
              🖼️ Belum ada foto pada kenangan yang dipilih.
            </div>
          `;
          return;
        }

        groupedCollageContainer.innerHTML = `
          <div class="photo-only-grid" aria-label="Galeri Semua Foto Kenangan">
            ${photoItems
              .map(
                ({ item, photoUrl }) => `
                  <button
                    type="button"
                    class="photo-only-tile btn-view"
                    data-id="${escapeHtml(item.id)}"
                    aria-label="Lihat kenangan ${escapeHtml(item.title)}"
                  >
                    <img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" />
                  </button>
                `
              )
              .join("")}
          </div>
        `;
        return;
      }

      const groupMap = new Map();
      filtered.forEach((item) => {
        const gName = (item.groupName || "Kenangan Umum").trim();
        if (!groupMap.has(gName)) groupMap.set(gName, []);
        groupMap.get(gName).push(item);
      });

      groupedCollageContainer.innerHTML = Array.from(groupMap.entries())
        .map(([groupName, items]) => {
          const cardsHtml = items
            .map((item) => {
              const photoUrl = createSafeObjectUrl(item.photoBlob);
              const localAudioUrl = createSafeObjectUrl(item.audioBlob);
              const safeFrame = sanitizeFrameStyle(item.frameStyle);
              const frameNote = item.note && item.note.trim()
                ? `🤍 "${escapeHtml(item.note.trim())}"`
                : `🤍 Selalu bikin rindu • ${escapeHtml(item.date)}`;
              const isEditing = editingId === item.id;

              return `
                <article class="memory-item">
                  <div>
                    <div class="memory-top">
                      <div>
                        <h3 class="memory-title">🌷 ${escapeHtml(item.title)}</h3>
                        <span class="memory-date">🗓️ ${escapeHtml(item.date)}</span>
                      </div>
                    </div>

                    ${
                      photoUrl
                        ? `
                      <div class="photo-frame-wrap">
                        <div class="photo-frame ${safeFrame}">
                          <img class="memory-photo" src="${escapeHtml(photoUrl)}" alt="${escapeHtml(item.title)}" />
                          <div class="frame-caption">${frameNote}</div>
                        </div>
                      </div>
                    `
                        : ""
                    }

                    ${
                      isEditing
                        ? `
                      <div class="edit-box" data-edit-id="${escapeHtml(item.id)}" style="margin-top: 12px;">
                        <label class="field">
                          <span>Judul</span>
                          <input type="text" class="edit-title" maxlength="100" value="${escapeHtml(item.title)}" />
                        </label>
                        <label class="field">
                          <span>Kelompok Kolase</span>
                          <input type="text" class="edit-group" maxlength="60" value="${escapeHtml(item.groupName || "Kenangan Umum")}" />
                        </label>
                        <label class="field">
                          <span>Caption Bingkai</span>
                          <input type="text" class="edit-note" maxlength="80" value="${escapeHtml(item.note || "")}" />
                        </label>
                        <label class="field">
                          <span>Cerita</span>
                          <textarea rows="3" class="edit-story" maxlength="2000">${escapeHtml(item.story)}</textarea>
                        </label>
                        <div class="edit-actions">
                          <button type="button" class="btn-secondary-sm btn-cancel-edit">Batal</button>
                          <button type="button" class="btn-save-edit" data-id="${escapeHtml(item.id)}">Simpan</button>
                        </div>
                      </div>
                    `
                        : `<p class="story-preview" style="margin-top: 12px;">${escapeHtml(item.story)}</p>`
                    }
                  </div>

                  <div>
                    ${renderAudioBlock(item, localAudioUrl)}
                    <div class="card-actions">
                      <button type="button" class="btn-view" data-id="${escapeHtml(item.id)}">👁️ Lihat Kenangan</button>
                      <button type="button" class="btn-secondary-sm btn-edit" data-id="${escapeHtml(item.id)}">Edit</button>
                      <button type="button" class="btn-delete" data-id="${escapeHtml(item.id)}">Hapus</button>
                    </div>
                  </div>
                </article>
              `;
            })
            .join("");

          return `
            <section class="collage-group">
              <div class="group-header">
                <h3 class="group-title">📂 ${escapeHtml(groupName)}</h3>
                <span class="group-badge">${items.length} foto/momen</span>
              </div>
              <div class="collage-grid">${cardsHtml}</div>
            </section>
          `;
        })
        .join("");
    }

    function setGalleryViewMode(mode) {
      galleryViewMode = mode === "photogrid" ? "photogrid" : "collage";
      viewModeCollageBtn.classList.toggle("active-mode", galleryViewMode === "collage");
      viewModePhotoGridBtn.classList.toggle("active-mode", galleryViewMode === "photogrid");
      render();
    }

    navInputBtn.addEventListener("click", () => switchPage("inputPage"));
    navGalleryBtn.addEventListener("click", () => switchPage("galleryPage"));
    backToInputBtn.addEventListener("click", () => switchPage("inputPage"));
    viewModeCollageBtn.addEventListener("click", () => setGalleryViewMode("collage"));
    viewModePhotoGridBtn.addEventListener("click", () => setGalleryViewMode("photogrid"));


    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (isSaving || !ensureDBReady()) return;

      const title = titleInput.value.trim();
      const date = dateInput.value;
      const groupName = groupInput.value.trim() || "Kenangan Umum";
      const frameStyle = sanitizeFrameStyle(frameStyleInput.value);
      const note = noteInput.value.trim();
      const story = storyInput.value.trim();
      const photoFile = photoInput.files[0] || null;
      const audioFile = audioInput.files[0] || null;
      const rawSpotifyUrl = spotifyUrlInput.value.trim();

      if (!title || !story || !date) {
        statusInfoEl.textContent = "⚠️ Lengkapi judul, tanggal, & cerita";
        return;
      }

      const fileError = validateMediaFiles(photoFile, audioFile);
      if (fileError) {
        statusInfoEl.textContent = fileError;
        return;
      }

      const spotifyCheck = extractValidSpotifyTrackId(rawSpotifyUrl);
      if (!spotifyCheck.valid) {
        statusInfoEl.textContent = spotifyCheck.error;
        return;
      }

      isSaving = true;
      statusInfoEl.textContent = "⏳ Menyimpan...";

      const optimizedPhoto = photoFile ? await compressImageBlob(photoFile) : null;
      const startSec = Math.max(0, Number(clipStartSecInput.value) || 0);
      const capDurSec = Math.min(40, Math.max(1, Number(clipDurationSecInput.value) || 40));
      clipDurationSecInput.value = String(capDurSec);

      let finalAudioBlob = null;
      if (audioFile) {
        const hasMatchingTrim =
          trimmedAudioBlob &&
          trimmedAudioMeta.file === audioFile &&
          trimmedAudioMeta.startSec === startSec &&
          trimmedAudioMeta.durSec === capDurSec;
        finalAudioBlob = hasMatchingTrim
          ? trimmedAudioBlob
          : await createMax40SecAudioClip(audioFile, startSec, capDurSec);
      }

      const newMemory = {
        id: Date.now().toString(),
        title,
        date,
        groupName,
        frameStyle,
        note,
        story,
        photoBlob: optimizedPhoto,
        audioBlob: finalAudioBlob,
        audioName: audioFile ? `${audioFile.name} [${capDurSec}s]` : "",
        clipDurationSec: capDurSec,
        lyricsSnippet: selectedLyricsInput.value.trim().slice(0, 600),
        trackMetaTitle: lyricTrackTitleInput.value.trim() || fetchedTrackMeta.title || "",
        trackMetaArtist: lyricArtistInput.value.trim() || fetchedTrackMeta.artist || "",
        spotifyTrackId: spotifyCheck.trackId
      };

      try {
        await putMemory(newMemory);
        memories = (await getAllMemories()).map(normalizeMemoryRow);
        form.reset();
        resetTrimmedAudioState();
        fetchedTrackMeta = { title: "", artist: "" };
        clipDurationSecInput.value = "40";
        clipStartSecInput.value = "1";
        clipStatusText.textContent = "Belum ada potongan audio (akan otomatis dibatasi maks. 40 detik saat disimpan).";
        pickedLinesSet.clear();
        lyricLinesPicker.hidden = true;
        lyricLinesPicker.innerHTML = "";
        spotifyMetaBox.hidden = true;
        spotifyMetaBox.innerHTML = "";
        dateInput.valueAsDate = new Date();
        frameStyleInput.value = "polaroid-tilt";
        statusInfoEl.textContent = "💗 Tersimpan!";
        switchPage("galleryPage");
      } catch {
        statusInfoEl.textContent = "⚠️ Gagal menyimpan (cek ruang memori)";
      } finally {
        isSaving = false;
      }
    });

    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value;
      render();
    });

    groupFilterSelect.addEventListener("change", () => {
      selectedGroupFilter = groupFilterSelect.value;
      render();
    });

    groupedCollageContainer.addEventListener("click", async (event) => {
      const viewBtn = event.target.closest(".btn-view");
      if (viewBtn) {
        const id = viewBtn.getAttribute("data-id");
        if (isSafeId(id)) openDetailModal(id);
        return;
      }

      const editBtn = event.target.closest(".btn-edit");
      if (editBtn) {
        const id = editBtn.getAttribute("data-id");
        if (!isSafeId(id)) return;
        editingId = editingId === id ? "" : id;
        render();
        return;
      }

      const cancelBtn = event.target.closest(".btn-cancel-edit");
      if (cancelBtn) {
        editingId = "";
        render();
        return;
      }

      const saveEditBtn = event.target.closest(".btn-save-edit");
      if (saveEditBtn) {
        if (!ensureDBReady()) return;
        const id = saveEditBtn.getAttribute("data-id");
        if (!isSafeId(id)) return;

        const editBox = groupedCollageContainer.querySelector(`.edit-box[data-edit-id="${id}"]`);
        if (!editBox) return;

        const nextTitle = editBox.querySelector(".edit-title")?.value.trim() || "";
        const nextGroup = editBox.querySelector(".edit-group")?.value.trim() || "Kenangan Umum";
        const nextNote = editBox.querySelector(".edit-note")?.value.trim() || "";
        const nextStory = editBox.querySelector(".edit-story")?.value.trim() || "";

        if (!nextTitle || !nextStory) {
          statusInfoEl.textContent = "⚠️ Judul & cerita tidak boleh kosong";
          return;
        }

        const existing = memories.find((m) => m.id === id);
        if (!existing) return;

        try {
          const updated = {
            ...existing,
            title: nextTitle,
            groupName: nextGroup,
            note: nextNote,
            story: nextStory
          };
          await putMemory(updated);
          memories = (await getAllMemories()).map(normalizeMemoryRow);
          editingId = "";
          render();
        } catch {
          statusInfoEl.textContent = "⚠️ Gagal menyimpan edit";
        }
        return;
      }

      const deleteBtn = event.target.closest(".btn-delete");
      if (!deleteBtn || !ensureDBReady()) return;
      const id = deleteBtn.getAttribute("data-id");
      if (!isSafeId(id)) return;

      try {
        await deleteMemoryById(id);
        if (editingId === id) editingId = "";
        memories = (await getAllMemories()).map(normalizeMemoryRow);
        render();
      } catch {
        statusInfoEl.textContent = "⚠️ Gagal menghapus data";
      }
    });

    closeModalBtn.addEventListener("click", closeDetailModal);
    detailModal.addEventListener("click", (event) => {
      if (event.target === detailModal) closeDetailModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !detailModal.hidden) {
        closeDetailModal();
      }
    });

    themeToggleBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      applyTheme(current === "dark" ? "light" : "dark");
    });

    window.addEventListener("online", updateNetworkUI);
    window.addEventListener("offline", updateNetworkUI);


    const fetchSpotifyMetaBtn = document.getElementById("fetchSpotifyMetaBtn");
    const searchLyricsBtn = document.getElementById("searchLyricsBtn");
    const spotifyMetaBox = document.getElementById("spotifyMetaBox");
    const lyricTrackTitleInput = document.getElementById("lyricTrackTitleInput");
    const lyricArtistInput = document.getElementById("lyricArtistInput");
    const clipStartSecInput = document.getElementById("clipStartSecInput");
    const clipDurationSecInput = document.getElementById("clipDurationSecInput");
    const trimAudio40Btn = document.getElementById("trimAudio40Btn");
    const clipStatusText = document.getElementById("clipStatusText");
    const clipPreviewAudio = document.getElementById("clipPreviewAudio");
    const lyricLinesPicker = document.getElementById("lyricLinesPicker");
    const selectedLyricsInput = document.getElementById("selectedLyricsInput");

    let trimmedAudioBlob = null;
    let trimmedAudioMeta = { file: null, startSec: 1, durSec: 40 };
    let trimmedAudioPreviewUrl = "";
    let fetchedTrackMeta = { title: "", artist: "" };
    let pickedLinesSet = new Set();

    function resetTrimmedAudioState() {
      trimmedAudioBlob = null;
      trimmedAudioMeta = { file: null, startSec: 1, durSec: 40 };
      if (trimmedAudioPreviewUrl) {
        URL.revokeObjectURL(trimmedAudioPreviewUrl);
        trimmedAudioPreviewUrl = "";
      }
      clipPreviewAudio.hidden = true;
      clipPreviewAudio.removeAttribute("src");
    }

    audioInput.addEventListener("change", () => {
      resetTrimmedAudioState();
      clipStatusText.textContent = "Belum ada potongan audio (akan otomatis dibatasi maks. 40 detik saat disimpan).";
    });

    function audioBufferToWavBlob(buffer) {
      const numChannels = buffer.numberOfChannels;
      const sampleRate = buffer.sampleRate;
      const numFrames = buffer.length;
      const bytesPerSample = 2;
      const blockAlign = numChannels * bytesPerSample;
      const dataSize = numFrames * blockAlign;
      const out = new ArrayBuffer(44 + dataSize);
      const view = new DataView(out);

      const writeStr = (offset, str) => {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
      };

      writeStr(0, "RIFF");
      view.setUint32(4, 36 + dataSize, true);
      writeStr(8, "WAVE");
      writeStr(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * blockAlign, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, 16, true);
      writeStr(36, "data");
      view.setUint32(40, dataSize, true);

      let offset = 44;
      const channels = [];
      for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

      for (let i = 0; i < numFrames; i++) {
        for (let c = 0; c < numChannels; c++) {
          let s = Math.max(-1, Math.min(1, channels[c][i]));
          s = s < 0 ? s * 0x8000 : s * 0x7fff;
          view.setInt16(offset, s, true);
          offset += 2;
        }
      }
      return new Blob([out], { type: "audio/wav" });
    }

    async function createMax40SecAudioClip(file, startSec = 1, durationSec = 40) {
      if (!file || !(file instanceof Blob)) return null;
      const safeStart = Math.max(0, Number(startSec) || 0);
      const safeDur = Math.min(40, Math.max(1, Number(durationSec) || 40));
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        return file.slice(0, Math.min(file.size, safeDur * 256 * 1024), file.type || "audio/mpeg");
      }
      const ctx = new AudioCtx();
      try {
        const arrBuf = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrBuf.slice(0));
        const actualStart = Math.min(safeStart, Math.max(0, decoded.duration - 1));
        const actualDur = Math.min(safeDur, Math.max(0.5, decoded.duration - actualStart));
        const startFrame = Math.floor(actualStart * decoded.sampleRate);
        const frameCount = Math.max(1, Math.floor(actualDur * decoded.sampleRate));

        const clipped = ctx.createBuffer(decoded.numberOfChannels, frameCount, decoded.sampleRate);
        for (let c = 0; c < decoded.numberOfChannels; c++) {
          const srcData = decoded.getChannelData(c);
          const dstData = clipped.getChannelData(c);
          for (let i = 0; i < frameCount; i++) {
            dstData[i] = srcData[startFrame + i] || 0;
          }
        }
        return audioBufferToWavBlob(clipped);
      } catch {
        const approxBytesPerSec = 32 * 1024;
        const startByte = Math.min(file.size, safeStart * approxBytesPerSec);
        const endByte = Math.min(file.size, startByte + safeDur * approxBytesPerSec);
        return file.slice(startByte, endByte, file.type || "audio/mpeg");
      } finally {
        if (typeof ctx.close === "function") ctx.close().catch(() => {});
      }
    }

    fetchSpotifyMetaBtn.addEventListener("click", async () => {
      const check = extractValidSpotifyTrackId(spotifyUrlInput.value.trim());
      if (!check.valid || !check.trackId) {
        statusInfoEl.textContent = "⚠️ Masukkan link track Spotify yang valid dulu";
        return;
      }
      if (!navigator.onLine) {
        statusInfoEl.textContent = "⚠️ Butuh koneksi internet untuk ambil info track Spotify";
        return;
      }
      statusInfoEl.textContent = "🎵 Mengambil info lagu...";
      try {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${check.trackId}`)}`;
        const res = await fetch(oembedUrl);
        if (!res.ok) throw new Error("oEmbed gagal");
        const data = await res.json();
        const rawTitle = String(data.title || "").trim();
        fetchedTrackMeta = { title: rawTitle, artist: "" };
        if (!lyricTrackTitleInput.value.trim() && rawTitle) {
          lyricTrackTitleInput.value = rawTitle;
        }
        spotifyMetaBox.hidden = false;
        const safeThumbUrl = sanitizeHttpsUrl(data.thumbnail_url);
        spotifyMetaBox.innerHTML = `
          ${safeThumbUrl ? `<img src="${escapeHtml(safeThumbUrl)}" alt="Cover lagu" />` : ""}
          <div>
            <strong>${escapeHtml(rawTitle || "Track Spotify")}</strong>
            <div class="hint">ID: ${escapeHtml(check.trackId)} · Isi kolom Penyanyi lalu klik "Cari Lirik"</div>
          </div>
        `;
        statusInfoEl.textContent = "✅ Info lagu diambil";
      } catch {
        statusInfoEl.textContent = "⚠️ Gagal ambil info track, isi judul & penyanyi manual";
      }
    });

    searchLyricsBtn.addEventListener("click", async () => {
      let trackName = lyricTrackTitleInput.value.trim();
      const artistName = lyricArtistInput.value.trim();
      if (!trackName && audioInput.files[0]) {
        trackName = audioInput.files[0].name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
        if (trackName) lyricTrackTitleInput.value = trackName;
      }
      if (!trackName) {
        statusInfoEl.textContent = "⚠️ Isi judul lagu untuk mencari lirik (atau tempel lirik manual di bawah)";
        return;
      }
      if (!navigator.onLine) {
        statusInfoEl.textContent = "🟠 Mode Offline: pencarian lirik online nonaktif, ketik/tempel lirik manual";
        return;
      }
      statusInfoEl.textContent = "📜 Mencari lirik...";
      try {
        const params = new URLSearchParams({ track_name: trackName });
        if (artistName) params.set("artist_name", artistName);
        let res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
        let data = null;
        if (res.ok) {
          data = await res.json();
        } else {
          const qText = [trackName, artistName].filter(Boolean).join(" ");
          const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(qText)}`);
          if (!searchRes.ok) throw new Error("Lirik tidak ditemukan");
          const list = await searchRes.json();
          if (!Array.isArray(list) || !list.length) throw new Error("Kosong");
          data = list.find((entry) => entry && (entry.plainLyrics || entry.syncedLyrics)) || list[0];
        }
        const plain = String((data && (data.plainLyrics || data.syncedLyrics)) || "").replace(/\[[^\]]*\]/g, "");
        const lines = plain
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

        if (!lines.length) throw new Error("Kosong");

        pickedLinesSet = new Set();
        lyricLinesPicker.hidden = false;
        lyricLinesPicker.innerHTML = lines
          .map((line, idx) => `<button type="button" class="lyric-line-chip" data-line-idx="${idx}">${escapeHtml(line)}</button>`)
          .join("");

        lyricLinesPicker.querySelectorAll(".lyric-line-chip").forEach((chip, idx) => {
          chip.addEventListener("click", () => {
            const text = lines[idx];
            if (pickedLinesSet.has(text)) {
              pickedLinesSet.delete(text);
              chip.classList.remove("active");
            } else {
              pickedLinesSet.add(text);
              chip.classList.add("active");
            }
            selectedLyricsInput.value = Array.from(pickedLinesSet).join("\n").slice(0, 600);
          });
        });
        statusInfoEl.textContent = `📜 ${lines.length} baris lirik ditemukan — klik baris bebas`;
      } catch {
        statusInfoEl.textContent = "⚠️ Lirik otomatis tidak ketemu, ketik/tempel lirik bebas di bawah";
      }
    });

    trimAudio40Btn.addEventListener("click", async () => {
      const audioFile = audioInput.files[0];
      if (!audioFile) {
        statusInfoEl.textContent = "⚠️ Pilih file lagu dulu sebelum memotong";
        return;
      }
      const startSec = Math.max(0, Number(clipStartSecInput.value) || 0);
      const durSec = Math.min(40, Math.max(1, Number(clipDurationSecInput.value) || 40));
      clipDurationSecInput.value = String(durSec);

      statusInfoEl.textContent = `✂️ Memotong audio (${durSec} dtk maks.)...`;
      const clip = await createMax40SecAudioClip(audioFile, startSec, durSec);
      if (clip) {
        trimmedAudioBlob = clip;
        trimmedAudioMeta = { file: audioFile, startSec, durSec };
        if (trimmedAudioPreviewUrl) URL.revokeObjectURL(trimmedAudioPreviewUrl);
        trimmedAudioPreviewUrl = URL.createObjectURL(clip);
        clipPreviewAudio.src = trimmedAudioPreviewUrl;
        clipPreviewAudio.hidden = false;
        clipStatusText.textContent = `✅ Potongan siap: mulai detik ke-${startSec}, durasi maks. ${durSec} detik.`;
        statusInfoEl.textContent = "✅ Potongan audio siap";
      }
    });


    document.addEventListener("play", (e) => {
      const currentAudio = e.target;
      if (!(currentAudio instanceof HTMLAudioElement)) return;
      document.querySelectorAll("audio").forEach((other) => {
        if (other !== currentAudio && !other.paused) {
          other.pause();
        }
      });
    }, true);

    document.addEventListener("timeupdate", (e) => {
      const audioEl = e.target;
      if (!(audioEl instanceof HTMLAudioElement) || !audioEl.classList.contains("capped-audio")) return;
      const maxSec = Math.min(40, Math.max(1, Number(audioEl.getAttribute("data-max-sec") || 40) || 40));
      if (audioEl.currentTime >= maxSec) {
        audioEl.pause();
        audioEl.currentTime = 0;
      }
    }, true);


    window.addEventListener("pagehide", () => {
      revokeActiveUrls();
      revokeModalUrls();
      if (trimmedAudioPreviewUrl) {
        URL.revokeObjectURL(trimmedAudioPreviewUrl);
        trimmedAudioPreviewUrl = "";
      }
    });

    (async function init() {
      let savedTheme = "light";
      try {
        savedTheme = localStorage.getItem(THEME_KEY) || "light";
      } catch {
        savedTheme = "light";
      }
      applyTheme(savedTheme);
      dateInput.valueAsDate = new Date();
      updateNetworkUI();

      try {
        db = await openDB();
        memories = (await getAllMemories()).map(normalizeMemoryRow);
        syncGroupSelectors();
        statusInfoEl.textContent = "✨ Siap dipakai";
      } catch {
        statusInfoEl.textContent = "⚠️ Penyimpanan lokal tidak tersedia";
      }
    })();
if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {
          // Abaikan jika dibuka via file:// tanpa HTTP server
        });
      });
    }
