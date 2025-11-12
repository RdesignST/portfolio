// Simple Portfolio with Card Grid + Image Upload (IndexedDB)
(() => {
  'use strict';

  // ---------- Utilities ----------
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k in node) node[k] = v;
      else node.setAttribute(k, v);
    });
    for (const c of children) node.append(c);
    return node;
  };

  const blobFromDataURL = async (dataURL) => {
    const res = await fetch(dataURL);
    return await res.blob();
  };

  // ---------- IndexedDB ----------
  const DB_NAME = 'portfolioDB';
  const STORE = 'projects';
  let db;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('by_title', 'title', { unique: false });
          store.createIndex('by_tags', 'tags', { unique: false, multiEntry: true });
        }
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror = e => reject(e.target.error);
    });
  }

  function tx(storeMode='readonly') {
    const t = db.transaction(STORE, storeMode);
    return t.objectStore(STORE);
  }

  function addProject(p) {
    return new Promise((resolve, reject) => {
      const req = tx('readwrite').add(p);
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  function updateProject(p) {
    return new Promise((resolve, reject) => {
      const req = tx('readwrite').put(p);
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  }

  function deleteProject(id) {
    return new Promise((resolve, reject) => {
      const req = tx('readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    });
  }

  function getAllProjects() {
    return new Promise((resolve, reject) => {
      const req = tx().getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  // ---------- State ----------
  let projects = [];
  let activeTag = null;

  // ---------- Rendering ----------
  const grid = $('#grid');
  const emptyState = $('#emptyState');
  const tagFilterWrap = $('#tagFilter');

  function render() {
    grid.innerHTML = '';
    let list = projects;

    const q = $('#search').value.trim().toLowerCase();
    if (q) {
      list = list.filter(p => (p.title || '').toLowerCase().includes(q) ||
        (p.tags || []).some(t => t.toLowerCase().includes(q)));
    }
    if (activeTag) {
      list = list.filter(p => (p.tags || []).includes(activeTag));
    }

    if (!list.length) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    for (const p of list) {
      const card = renderCard(p);
      grid.append(card);
    }
  }

  function renderCard(p) {
    const tpl = $('#cardTemplate');
    const node = tpl.content.firstElementChild.cloneNode(true);
    const img = node.querySelector('.thumb');
    const title = node.querySelector('.card-title');
    const desc = node.querySelector('.card-desc');
    const tags = node.querySelector('.card-tags');

    title.textContent = p.title || 'Untitled';
    desc.textContent = p.desc || '';
    tags.innerHTML = '';

    for (const t of (p.tags || [])) {
      const chip = el('span', { className: 'tag' }, t);
      tags.append(chip);
    }

    // Create object URL for blob
    if (p.imageBlob) {
      const url = URL.createObjectURL(p.imageBlob);
      img.src = url;
      img.alt = p.title ? `${p.title} 썸네일` : '작품 이미지';
      img.onload = () => URL.revokeObjectURL(url);
    } else {
      img.alt = '이미지 없음';
    }

    node.querySelector('[data-action="edit"]').addEventListener('click', () => openEditor(p));
    node.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm('이 작품을 삭제하시겠어요?')) return;
      await deleteProject(p.id);
      await loadProjects();
    });

    return node;
  }

  function collectTags() {
    const set = new Set();
    for (const p of projects) for (const t of (p.tags || [])) set.add(t);
    return Array.from(set).sort((a,b)=>a.localeCompare(b));
  }

  function renderTags() {
    tagFilterWrap.innerHTML = '';
    const allBtn = el('button', { className: 'tag-chip' + (activeTag ? '' : ' is-active')}, '전체');
    allBtn.addEventListener('click', ()=>{ activeTag=null; render(); renderTags(); });
    tagFilterWrap.append(allBtn);

    for (const t of collectTags()) {
      const btn = el('button', { className: 'tag-chip' + (activeTag===t ? ' is-active' : '') }, t);
      btn.addEventListener('click', ()=>{ activeTag = (activeTag===t ? null : t); render(); renderTags(); });
      tagFilterWrap.append(btn);
    }
  }

  // ---------- Editor Dialog ----------
  const dialog = $('#editor');
  const form = $('#projectForm');
  const dialogTitle = $('#dialogTitle');
  const idInput = $('#projectId');
  const titleInput = $('#title');
  const descInput = $('#desc');
  const tagsInput = $('#tags');
  const imageInput = $('#image');
  const drop = $('#drop');
  const chooseImage = $('#chooseImage');
  const preview = $('#preview');
  const deleteBtn = $('#deleteBtn');
  const saveBtn = $('#saveBtn');
  const closeDialog = $('#closeDialog');

  let currentImageBlob = null;

  function openEditor(p=null) {
    form.reset();
    currentImageBlob = null;
    preview.innerHTML = '이미지 미리보기 없음';

    if (p) {
      dialogTitle.textContent = '작품 수정';
      idInput.value = p.id;
      titleInput.value = p.title || '';
      descInput.value = p.desc || '';
      tagsInput.value = (p.tags || []).join(', ');
      if (p.imageBlob) {
        currentImageBlob = p.imageBlob;
        const url = URL.createObjectURL(p.imageBlob);
        preview.innerHTML = '';
        const img = el('img', { src: url, alt: '미리보기' });
        preview.append(img);
        img.onload = () => URL.revokeObjectURL(url);
      }
      deleteBtn.hidden = false;
    } else {
      dialogTitle.textContent = '작품 추가';
      idInput.value = '';
      deleteBtn.hidden = true;
    }
    dialog.showModal();
    titleInput.focus();
  }

  function closeEditor() {
    dialog.close();
  }

  async function loadProjects() {
    projects = await getAllProjects();
    render();
    renderTags();
  }

  // Drag & Drop
  function onDropFiles(files) {
    const f = files && files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { alert('이미지 파일만 업로드할 수 있어요.'); return; }
    if (f.size > 8 * 1024 * 1024) { alert('파일이 너무 커요. 8MB 이하를 권장합니다.'); return; }
    imageInput.files = files;
    showPreview(f);
  }

  function showPreview(file) {
    const reader = new FileReader();
    reader.onload = () => {
      preview.innerHTML = '';
      const img = el('img', { src: reader.result, alt: '미리보기' });
      preview.append(img);
    };
    reader.readAsDataURL(file);
  }

  // ---------- Export / Import ----------
  async function exportData() {
    const list = await getAllProjects();
    // Convert blobs to base64 data URLs for portability
    const serial = [];
    for (const p of list) {
      let dataURL = null;
      if (p.imageBlob) {
        dataURL = await new Promise(resolve => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.readAsDataURL(p.imageBlob);
        });
      }
      serial.push({
        title: p.title,
        desc: p.desc,
        tags: p.tags,
        imageDataURL: dataURL,
      });
    }
    const blob = new Blob([JSON.stringify({ version:1, items: serial }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href:url, download:'portfolio-export.json' });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importData(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.items)) throw new Error('가져오기 형식이 올바르지 않습니다.');
    for (const item of data.items) {
      let blob = null;
      if (item.imageDataURL) blob = await (await fetch(item.imageDataURL)).blob();
      await addProject({
        title: item.title || '',
        desc: item.desc || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        imageBlob: blob,
        createdAt: Date.now(),
      });
    }
    await loadProjects();
  }

  // ---------- Event wiring ----------
  window.addEventListener('DOMContentLoaded', async () => {
    await openDB();
    await loadProjects();

    $('#btn-add').addEventListener('click', ()=> openEditor());
    $('#btn-export').addEventListener('click', exportData);
    $('#import-input').addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) importData(file).catch(err => alert(err.message || String(err)));
      e.target.value = '';
    });

    $('#search').addEventListener('input', render);

    closeDialog.addEventListener('click', closeEditor);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      saveBtn.disabled = true;

      const tags = tagsInput.value.split(',').map(s => s.trim()).filter(Boolean);

      if (imageInput.files && imageInput.files[0]) {
        currentImageBlob = imageInput.files[0];
      }

      const payload = {
        title: titleInput.value.trim(),
        desc: descInput.value.trim(),
        tags,
        imageBlob: currentImageBlob || null,
        updatedAt: Date.now(),
      };

      try {
        if (idInput.value) {
          payload.id = Number(idInput.value);
          await updateProject(payload);
        } else {
          payload.createdAt = Date.now();
          await addProject(payload);
        }
        await loadProjects();
        closeEditor();
      } catch (err) {
        alert('저장 중 오류가 발생했습니다.');
        console.error(err);
      } finally {
        saveBtn.disabled = false;
      }
    });

    deleteBtn.addEventListener('click', async () => {
      if (!idInput.value) return;
      if (!confirm('이 작품을 삭제하시겠어요?')) return;
      await deleteProject(Number(idInput.value));
      await loadProjects();
      closeEditor();
    });

    // DnD interactions
    const drop = $('#drop');
    const imageInput = $('#image');
    const chooseImage = $('#chooseImage');
    const preview = $('#preview');

    const prevent = e => { e.preventDefault(); e.stopPropagation(); };
    ['dragenter','dragover','dragleave','drop'].forEach(name => {
      drop.addEventListener(name, prevent, false);
    });
    drop.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      onDropFiles(files);
    });
    drop.addEventListener('click', () => imageInput.click());
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        imageInput.click();
      }
    });
    chooseImage.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', () => {
      const f = imageInput.files && imageInput.files[0];
      if (f) showPreview(f);
    });
  });
})();