/* Meshwright — 2D UV Unfold & PBR Material Controls */
(() => {
    const $ = (id) => document.getElementById(id);
    const api = () => (window.pywebview && window.pywebview.api) || null;

    let uvData = null;
    let textureMaps = null;
    let activeChannel = 'none';
    let channelImages = {};

    // The maps are megabytes of base64, so the backend sends a version number with
    // every operation and we only re-fetch the pixels when it moves. The UV
    // wireframe is fetched when the 2D view actually opens.
    let mapsVersion = -1;
    let uvStateId = -1;
    let hasUv = false;

    // 2D UV Canvas Pan & Zoom
    let uvZoom = 1.0;
    let uvPan = { x: 0, y: 0 };
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let btnOpenUv = null;

    function init() {
        bindToolbarModes();
        bindTextureControls();
        bindUvModal();
    }

    function bindToolbarModes() {
        document.querySelectorAll('#segPbrModes button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.viewport-tools button[data-mode]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const mode = btn.dataset.mode;
                if (window.viewer) window.viewer.setMode(mode);
            });
        });

        btnOpenUv = $('btnOpenUv');
        if (btnOpenUv) btnOpenUv.addEventListener('click', openUvModal);
    }

    function bindTextureControls() {
        const btnUnwrap = $('btnUnwrapUV');
        const btnViewUv = $('btnViewUV');
        const btnLoadTex = $('btnLoadTexture');
        const btnExportTex = $('btnExportTex');
        const btnReloadTex = $('btnReloadTex');
        const btnBakeGLB = $('btnBakeGLB');

        const slNormal = $('pbrNormalStr');
        const slRoughness = $('pbrRoughness');
        const slMetallic = $('pbrMetallic');
        const chkOpenGL = $('chkOpenGLNormal');
        const chkTileable = $('chkTileable');
        const slDisplace = $('pbrDisplace');

        if (slNormal) slNormal.oninput = () => { $('valNormalStr').textContent = slNormal.value; };
        if (slRoughness) slRoughness.oninput = () => { $('valRoughness').textContent = slRoughness.value; };
        if (slMetallic) slMetallic.oninput = () => { $('valMetallic').textContent = slMetallic.value; };
        if (slDisplace) slDisplace.oninput = () => {
            const mm = parseFloat(slDisplace.value);
            $('valDisplace').textContent = mm > 0 ? `${mm.toFixed(1)} mm` : T('tex.off');
            if (window.viewer) window.viewer.setDisplacement(mm);
        };

        if (btnUnwrap) btnUnwrap.addEventListener('click', () => runUnwrap(false));

        if (btnLoadTex) {
            btnLoadTex.addEventListener('click', async () => {
                try {
                    const imgPath = await api().select_image_dialog();
                    if (!imgPath) return;

                    btnLoadTex.disabled = true;
                    const res = await api().generate_pbr_maps(
                        imgPath,
                        parseFloat(slNormal ? slNormal.value : 2.0),
                        chkOpenGL ? chkOpenGL.checked : true,
                        Math.max(0.0, parseFloat(slRoughness ? slRoughness.value : 0.5) - 0.2),
                        Math.min(1.0, parseFloat(slRoughness ? slRoughness.value : 0.5) + 0.3),
                        parseFloat(slMetallic ? slMetallic.value : 0.0),
                        1.0,
                        chkTileable ? chkTileable.checked : false
                    );

                    if (res && res.success) {
                        await applyTextureState(res);
                        toast('pbr', { kind: 'ok', title: T('tex.generated'), body: T('tex.generatedBody') });
                    } else if (res && res.error) {
                        toast('pbr', { kind: 'error', title: T('tex.genFailed'), body: res.error });
                    }
                } catch (e) {
                    toast('pbr', { kind: 'error', title: T('tex.genError'), body: String(e) });
                } finally {
                    btnLoadTex.disabled = false;
                }
            });
        }

        if (btnExportTex) {
            btnExportTex.addEventListener('click', async () => {
                try {
                    const res = await api().export_texture_folder();
                    if (res && res.success && res.result) {
                        toast('tex_exp', {
                            kind: 'ok',
                            title: T('tex.exported'),
                            body: T('tex.exportedBody', { n: res.result.count, dir: res.result.directory })
                        });
                    } else if (res && !res.canceled) {
                        toast('tex_exp', { kind: 'error', title: T('tex.exportFailed'), body: res.error || T('tex.unknownError') });
                    }
                } catch (e) {
                    toast('tex_exp', { kind: 'error', title: T('tex.exportError'), body: String(e) });
                }
            });
        }

        if (btnReloadTex) {
            btnReloadTex.addEventListener('click', async () => {
                try {
                    const res = await api().reload_texture_folder();
                    if (res && res.success) {
                        await applyTextureState(res);
                        const count = (res.reloaded && res.reloaded.reloaded_channels) ? res.reloaded.reloaded_channels.length : 0;
                        toast('tex_reload', { kind: 'ok', title: T('tex.reloaded'), body: T('tex.reloadedBody', { n: count }) });
                    } else if (res && res.error) {
                        toast('tex_reload', { kind: 'error', title: T('tex.reloadFailed'), body: res.error });
                    }
                } catch (e) {
                    toast('tex_reload', { kind: 'error', title: T('tex.reloadError'), body: String(e) });
                }
            });
        }

        if (btnBakeGLB) {
            btnBakeGLB.addEventListener('click', async () => {
                try {
                    const res = await api().export_baked_glb();
                    if (res && res.success) {
                        toast('bake', { kind: 'ok', title: T('tex.baked'), body: T('tex.bakedBody', { n: res.size_mb }) });
                    } else if (res && !res.canceled) {
                        toast('bake', { kind: 'error', title: T('tex.bakeFailed'), body: res.error || T('tex.bakeNoWrite') });
                    }
                } catch (e) {
                    toast('bake', { kind: 'error', title: T('tex.bakeError'), body: String(e) });
                }
            });
        }

        if (btnViewUv) btnViewUv.addEventListener('click', openUvModal);
    }

    /* A model that already has UVs is only re-unwrapped after the user says so:
       the new layout invalidates any texture painted against the old one. */
    async function runUnwrap(force) {
        const btnUnwrap = $('btnUnwrapUV');
        const btnViewUv = $('btnViewUV');
        if (btnUnwrap) btnUnwrap.disabled = true;
        try {
            const res = await api().unwrap_model_uvs(force);

            if (res && res.needs_confirm) {
                const lost = res.has_textures ? T('tex.unwrapLostTex') : T('tex.unwrapLostPaint');
                confirmModal(T('tex.unwrapConfirm'),
                    T('tex.unwrapConfirmBody', { lost: lost }),
                    T('tex.unwrapAnyway'), () => runUnwrap(true));
                return;
            }

            if (res && res.success) {
                if (window.meshwright && window.meshwright.showModel) window.meshwright.showModel(res);
                if (res.uv_layout) { uvData = res.uv_layout; uvStateId = res.uv_layout.state_id; }
                const st = res.uv_stats;
                lastUvStats = st || null;
                if (st) {
                    paintUvStats(st);
                }
                if (btnViewUv) btnViewUv.disabled = false;
                if (btnOpenUv) btnOpenUv.disabled = false;
                toast('unwrap', {
                    kind: st && st.even === false ? 'warn' : 'ok',
                    title: T('tex.unwrapped'),
                    body: st && st.even === false
                        ? T('tex.unwrappedUneven', { s: st.texel_spread.toFixed(1) })
                        : T('tex.unwrappedEven'),
                    ms: st && st.even === false ? 12000 : 6000,
                });
            } else if (res && res.error) {
                toast('unwrap', { kind: 'error', title: T('tex.unwrapFailed'), body: res.error, ms: 14000 });
            }
        } catch (e) {
            toast('unwrap', { kind: 'error', title: T('tex.unwrapFailed'), body: String(e) });
        } finally {
            if (btnUnwrap) btnUnwrap.disabled = false;
        }
    }

    let lastUvStats = null;
    function paintUvStats(st) {
        const statEl = $('uvStats');
        const even = st.even ? T('tex.evenDensity') : T('tex.varyingDensity', { s: st.texel_spread.toFixed(1) });
        statEl.textContent = `${Tp('pl.islands', st.islands, { n: st.islands })}, ${st.seam_edges.toLocaleString()} ${T('tex.seamEdges')} `
            + `${st.atlas_size[0]}×${st.atlas_size[1]} atlas · ${even}`;
        statEl.classList.remove('hidden');
    }

    function confirmModal(title, bodyHtml, confirmLabel, onConfirm) {
        if (window.meshwright && window.meshwright.confirm) {
            window.meshwright.confirm(title, bodyHtml, confirmLabel, onConfirm);
        } else if (window.confirm(title)) {
            onConfirm();
        }
    }

    /* Called after every operation with the light summary from the backend:
       which channels exist, their version, and whether the mesh has UVs. */
    async function applyTextureState(summary) {
        if (!summary) return;
        hasUv = !!summary.has_uv;

        // Geometry changed, so the cached UV wireframe no longer describes it.
        if (summary.state_id !== undefined && summary.state_id !== uvStateId) {
            uvStateId = summary.state_id;
            uvData = null;
        }
        if (summary.uv_layout) { uvData = summary.uv_layout; uvStateId = summary.uv_layout.state_id; }

        if (!summary.has_textures) {
            textureMaps = null;
            channelImages = {};
            mapsVersion = summary.texture_version !== undefined ? summary.texture_version : -1;
            if (window.viewer) window.viewer.clearTextures();
        } else if (summary.texture_version !== mapsVersion) {
            try {
                const res = await api().get_texture_maps();
                if (res && res.success) applyMaps(res.maps, res.texture_version);
            } catch (e) {
                toast('tex_fetch', { kind: 'error', title: T('tex.fetchFailed'), body: String(e) });
            }
        }

        updateTextureButtons(!!summary.has_textures);
        if ($('uvModal') && !$('uvModal').classList.contains('hidden')) renderUvCanvas();
    }

    function applyMaps(maps, version) {
        textureMaps = maps || null;
        mapsVersion = version !== undefined ? version : mapsVersion;
        if (!textureMaps) return;

        if (window.viewer) {
            window.viewer.applyPBRTextures(textureMaps);
            document.querySelectorAll('.viewport-tools button[data-mode]').forEach(b => b.classList.remove('active'));
            const pbrBtn = document.querySelector('.viewport-tools button[data-mode="pbr"]');
            if (pbrBtn) pbrBtn.classList.add('active');
        }

        // Backdrops for the 2D UV canvas.
        channelImages = {};
        ['albedo', 'normal', 'roughness', 'metallic', 'ao', 'height'].forEach(ch => {
            if (textureMaps[ch]) {
                const img = new Image();
                img.onload = () => {
                    if ($('uvModal') && !$('uvModal').classList.contains('hidden')) renderUvCanvas();
                };
                img.src = textureMaps[ch];
                channelImages[ch] = img;
            }
        });
    }

    function updateTextureButtons(hasTextures) {
        const enable = (id, on) => { const el = $(id); if (el) el.disabled = !on; };
        for (const id of ['btnExportTex', 'btnReloadTex', 'btnBakeGLB']) enable(id, hasTextures);
        for (const id of ['btnViewUV', 'btnOpenUv']) enable(id, hasUv);

        // Displacement is only meaningful once a height map exists.
        const hasHeight = hasTextures && !!(textureMaps && textureMaps.height);
        const slDisplace = $('pbrDisplace');
        if (slDisplace) {
            slDisplace.disabled = !hasHeight;
            if (!hasHeight) {
                slDisplace.value = 0;
                $('valDisplace').textContent = T('tex.off');
                if (window.viewer) window.viewer.setDisplacement(0);
            }
        }
        const heightBtn = document.querySelector('.viewport-tools button[data-mode="height_map"]');
        if (heightBtn) heightBtn.disabled = !hasHeight;
    }

    /* The UV wireframe is a large array and only the 2D view needs it. */
    async function ensureUvLayout() {
        if (uvData || !api()) return;
        try {
            const res = await api().get_uv_layout();
            if (res && res.success) { uvData = res; uvStateId = res.state_id; }
        } catch { /* the canvas shows its own empty state */ }
    }

    /* Back to "no model": drop every cached map so the next model cannot inherit
       the previous one's textures, and lock the texture actions again. */
    function resetTextureState() {
        uvData = null;
        textureMaps = null;
        channelImages = {};
        activeChannel = 'none';
        mapsVersion = -1;
        uvStateId = -1;
        hasUv = false;
        const slDisplace = $('pbrDisplace');
        if (slDisplace) { slDisplace.value = 0; slDisplace.disabled = true; }
        if ($('valDisplace')) $('valDisplace').textContent = T('tex.off');
        uvZoom = 1.0;
        uvPan = { x: 0, y: 0 };

        const stats = $('uvStats');
        if (stats) { stats.textContent = ''; stats.classList.add('hidden'); }

        for (const id of ['btnExportTex', 'btnReloadTex', 'btnBakeGLB', 'btnViewUV', 'btnOpenUv',
                          'btnUnwrapUV', 'btnLoadTexture']) {
            const el = $(id);
            if (el) el.disabled = true;
        }

        document.querySelectorAll('#uvChannelSeg button').forEach(b => b.classList.remove('active'));
        const noneTab = document.querySelector('#uvChannelSeg button[data-uvchannel="none"]');
        if (noneTab) noneTab.classList.add('active');

        document.querySelectorAll('.viewport-tools button[data-mode]').forEach(b => b.classList.remove('active'));
        const shadedBtn = document.querySelector('.viewport-tools button[data-mode="shaded"]');
        if (shadedBtn) shadedBtn.classList.add('active');

        closeUvModal();
        renderUvCanvas();
    }

    function bindUvModal() {
        const modal = $('uvModal');
        const btnClose = $('btnUvClose');
        const canvas = $('uvCanvas');
        const btnExportGuide = $('btnExportUvWireframe');

        if (btnClose) btnClose.addEventListener('click', closeUvModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeUvModal();
        });

        // Channel tabs
        document.querySelectorAll('#uvChannelSeg button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#uvChannelSeg button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeChannel = btn.dataset.uvchannel || 'none';
                renderUvCanvas();
            });
        });

        if (btnExportGuide && canvas) {
            btnExportGuide.addEventListener('click', () => {
                const link = document.createElement('a');
                link.download = 'uv_guide.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            });
        }

        // Pan & Zoom handlers on UV canvas
        if (canvas) {
            canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 1.15 : 0.85;
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                uvPan.x = mx - (mx - uvPan.x) * delta;
                uvPan.y = my - (my - uvPan.y) * delta;
                uvZoom = Math.min(10.0, Math.max(0.5, uvZoom * delta));
                renderUvCanvas();
            });

            canvas.addEventListener('mousedown', (e) => {
                isDragging = true;
                dragStart = { x: e.clientX - uvPan.x, y: e.clientY - uvPan.y };
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                uvPan.x = e.clientX - dragStart.x;
                uvPan.y = e.clientY - dragStart.y;
                renderUvCanvas();
            });

            window.addEventListener('mouseup', () => { isDragging = false; });

            canvas.addEventListener('dblclick', () => {
                uvZoom = 1.0;
                uvPan = { x: 0, y: 0 };
                renderUvCanvas();
            });
        }
    }

    async function openUvModal() {
        const modal = $('uvModal');
        if (!modal) return;
        modal.classList.remove('hidden');

        uvZoom = 1.0;
        uvPan = { x: 0, y: 0 };

        // Default to albedo if textures exist and channel is currently none
        if (activeChannel === 'none' && (channelImages.albedo || (textureMaps && textureMaps.albedo))) {
            activeChannel = 'albedo';
            document.querySelectorAll('#uvChannelSeg button').forEach(b => b.classList.remove('active'));
            const albBtn = document.querySelector('#uvChannelSeg button[data-uvchannel="albedo"]');
            if (albBtn) albBtn.classList.add('active');
        }

        renderUvCanvas();          // draw the frame immediately, fill it in below
        await ensureUvLayout();
        renderUvCanvas();
    }

    function closeUvModal() {
        const modal = $('uvModal');
        if (modal) modal.classList.add('hidden');
    }

    function renderUvCanvas() {
        const canvas = $('uvCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;

        ctx.save();
        ctx.clearRect(0, 0, w, h);

        // Apply pan & zoom
        ctx.translate(uvPan.x, uvPan.y);
        ctx.scale(uvZoom, uvZoom);

        // Background: Texture map or dark checker
        const bgImg = (activeChannel !== 'none' && channelImages[activeChannel]) ? channelImages[activeChannel] : null;
        if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
            ctx.drawImage(bgImg, 0, 0, w, h);
        } else {
            // Dark grid background
            ctx.fillStyle = '#141619';
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#22262c';
            ctx.lineWidth = 1 / uvZoom;
            const step = 40;
            ctx.beginPath();
            for (let x = 0; x <= w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
            for (let y = 0; y <= h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
            ctx.stroke();
        }

        // A note when the canvas is showing island outlines rather than every edge.
        const hint = $('uvHint');
        if (hint) {
            hint.textContent = uvData && uvData.outlines_only
                ? T('tex.outlines', { n: uvData.edge_count.toLocaleString() })
                : '';
            hint.classList.toggle('hidden', !(uvData && uvData.outlines_only));
        }

        // UV Wireframe lines
        if (uvData && uvData.lines && uvData.lines.length) {
            ctx.strokeStyle = activeChannel === 'none' ? '#22d3ee' : '#f0c364';
            ctx.lineWidth = Math.max(0.8, 1.2 / uvZoom);
            ctx.beginPath();
            const lines = uvData.lines;
            for (let i = 0; i < lines.length; i += 4) {
                const x1 = lines[i] * w;
                const y1 = (1.0 - lines[i + 1]) * h; // UV V is bottom-up
                const x2 = lines[i + 2] * w;
                const y2 = (1.0 - lines[i + 3]) * h;
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
            }
            ctx.stroke();
        } else {
            // Placeholder text if mesh has no UVs
            ctx.fillStyle = '#8a9099';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(T('tex.noUv'), w / 2, h / 2);
        }

        // Outer border
        ctx.strokeStyle = '#d9a441';
        ctx.lineWidth = 1.5 / uvZoom;
        ctx.strokeRect(0, 0, w, h);

        ctx.restore();
    }

    function toast(key, opts) {
        if (window.meshwright && window.meshwright.toast) {
            window.meshwright.toast(key, opts);
        }
    }

    document.addEventListener('DOMContentLoaded', init);
    if (window.I18N) window.I18N.onChange(() => {
        if (lastUvStats) paintUvStats(lastUvStats);
        if ($('valDisplace') && $('pbrDisplace') && $('pbrDisplace').disabled) {
            $('valDisplace').textContent = T('tex.off');
        }
        renderUvCanvas();
    });
    window.meshwrightTexture = {
        applyTextureState, resetTextureState, runUnwrap,
        openUvModal, closeUvModal, renderUvCanvas,
    };
})();
