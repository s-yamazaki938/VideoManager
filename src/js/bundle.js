// Video Manager Bundle
// Consolidated from modular refactoring to support file:// protocol (bypassing CORS for ESModules)

const VideoManager = (() => {
    // --- Utils ---
    const fmtDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('ja-JP', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // --- Config & Supabase ---
    const SB_URL = 'https://tpemermrrxgdxppzewpn.supabase.co';
    const SB_KEY = 'sb_publishable_zr76EeMU58HUMoJJivdDoQ_Hflm3xX8';
    const db = supabase.createClient(SB_URL, SB_KEY);

    // --- API ---
    const api = {
        async fetchInitialData() {
            const [u, a, c] = await Promise.all([
                db.from('m_user').select('id, user_id'),
                db.from('m_actor').select('*'),
                db.from('m_category').select('*')
            ]);
            return { users: u.data, actors: a.data, categories: c.data };
        },
        async fetchAdminUser() {
            return await db.from('m_user').select('*').eq('user_id', 'admin').maybeSingle();
        },
        async fetchVideos() {
            const { data } = await db.from('url').select('*').order('created_at', { ascending: false });
            return data || [];
        },
        async addVideo(videoData) {
            return await db.from('url').insert(videoData);
        },
        async updateVideo(id, videoData) {
            return await db.from('url').update(videoData).eq('id', id);
        },
        async deleteVideo(id) {
            return await db.from('url').delete().eq('id', id);
        },
        async fetchActors() {
            const { data } = await db.from('m_actor').select('*').order('created_at', { ascending: false });
            return data || [];
        },
        async addActor(actorData) {
            return await db.from('m_actor').insert(actorData);
        },
        async updateActor(id, actorData) {
            return await db.from('m_actor').update(actorData).eq('id', id);
        },
        async deleteActor(id) {
            return await db.from('m_actor').delete().eq('id', id);
        },
        async fetchCategories() {
            const { data } = await db.from('m_category').select('*');
            return data || [];
        },
        async addCategory(categoryData) {
            return await db.from('m_category').insert(categoryData);
        },
        async updateCategory(id, categoryData) {
            return await db.from('m_category').update(categoryData).eq('id', id);
        },
        async deleteCategory(id) {
            return await db.from('m_category').delete().eq('id', id);
        }
    };

    // --- State ---
    let currentUser = null;
    let userCache = {};
    let actors = {};
    let cats = {};
    let allVideos = [];
    let editingVideoId = null;
    let editingActorId = null;
    let editingCategoryId = null;

    // --- UI ---
    const ui = {
        elements: {
            sidebar: document.getElementById('sidebar'),
            overlay: document.getElementById('menu-overlay'),
            mainContent: document.getElementById('main-content'),
            loadingOverlay: document.getElementById('loading-overlay'),
            mobileHeader: document.getElementById('mobile-nav'),
            displayUser: document.getElementById('display-user'),
            screenTitle: document.getElementById('screen-title')
        },

        setInitialUser(user) {
            currentUser = user;
            ui.elements.displayUser.innerText = `Logged in as: ${currentUser.user_id}`;
            ui.elements.loadingOverlay.style.display = 'none';
            ui.elements.sidebar.style.display = 'block';
            ui.elements.mainContent.style.display = 'block';
            if (window.innerWidth <= 768) ui.elements.mobileHeader.style.display = 'flex';
        },

        toggleTheme() {
            const theme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            document.body.setAttribute('data-theme', theme);
        },

        async showScreen(id) {
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            const screen = document.getElementById(id + '-screen');
            if (screen) screen.classList.add('active');

            const titles = {
                dashboard: 'Dashboard',
                video: 'Video List',
                actor: 'Actor Master',
                category: 'Category Master'
            };
            ui.elements.screenTitle.innerText = titles[id] || 'Video Manager';

            ui.elements.sidebar.classList.remove('open');
            ui.elements.overlay.classList.remove('active');

            await ui.refreshData();

            if (id === 'dashboard') await ui.loadDashboard();
            if (id === 'video') await ui.loadVideos();
            if (id === 'actor') await ui.loadActors();
            if (id === 'category') await ui.loadCategories();
        },

        async refreshData() {
            const { users, actors: actorList, categories } = await api.fetchInitialData();
            userCache = Object.fromEntries(users.map(i => [i.id, i.user_id]));
            actors = Object.fromEntries(actorList.map(i => [i.id, i.actor_name]));
            cats = Object.fromEntries(categories.map(i => [i.id, i.category_name]));

            const aOpts = actorList.map(i => `<option value="${i.id}">${i.actor_name}</option>`).join('');
            const selectActor = document.getElementById('select-actor');
            const filterActor = document.getElementById('filter-actor');
            const selectCategory = document.getElementById('select-category');

            if (selectActor) selectActor.innerHTML = aOpts;
            if (filterActor) filterActor.innerHTML = '<option value="">All Actors</option>' + aOpts;
            if (selectCategory) selectCategory.innerHTML = categories.map(i => `<option value="${i.id}">${i.category_name}</option>`).join('');
        },

        async loadDashboard() {
            allVideos = await api.fetchVideos();
            document.getElementById('stat-video').innerText = allVideos.length;
            document.getElementById('stat-actor').innerText = Object.keys(actors).length;
            document.getElementById('stat-cat').innerText = Object.keys(cats).length;

            const tbody = document.querySelector('#table-recent tbody');
            tbody.innerHTML = allVideos.slice(0, 5).map(v => `
                <tr>
                    <td class="td-title">${v.video_title || '(No Title)'}</td>
                    <td class="td-url">${v.url}</td>
                    <td>${fmtDate(v.created_at)}</td>
                </tr>`).join('');
        },

        async loadVideos() {
            allVideos = await api.fetchVideos();
            ui.filterVideos();
        },

        filterVideos() {
            const searchBox = document.getElementById('search-box');
            const filterActor = document.getElementById('filter-actor');
            if (!searchBox || !filterActor) return;

            const word = searchBox.value.toLowerCase();
            const aid = filterActor.value;

            const filtered = allVideos.filter(v => {
                const matchActorSelect = !aid || v.actor_id == aid;
                const vTitle = (v.video_title || "").toLowerCase();
                const vUrl = (v.url || "").toLowerCase();
                const vActor = (actors[v.actor_id] || "").toLowerCase();
                const vCat = (cats[v.category_id] || "").toLowerCase();
                return matchActorSelect && (vTitle.includes(word) || vUrl.includes(word) || vActor.includes(word) || vCat.includes(word));
            });

            const tbody = document.querySelector('#table-video tbody');
            tbody.innerHTML = filtered.map(v => `
                <tr>
                    <td data-label="Video Title" class="td-title">${v.video_title || '(No Title)'}</td>
                    <td data-label="URL"><a href="${v.url}" target="_blank" class="td-url">${v.url}</a></td>
                    <td data-label="Actor">${actors[v.actor_id] || '-'}</td>
                    <td data-label="Category">${cats[v.category_id] || '-'}</td>
                    <td data-label="Creator">${userCache[v.creator_id] || '-'}</td>
                    <td data-label="Created">${fmtDate(v.created_at)}</td>
                    <td data-label="Updater">${userCache[v.updater_id] || '-'}</td>
                    <td data-label="Updated">${fmtDate(v.updated_at)}</td>
                    <td data-label="Action">
                        <button class="nm-btn btn-edit-video" data-id="${v.id}" data-url="${v.url}" data-aid="${v.actor_id}" data-cid="${v.category_id}" data-title="${v.video_title || ''}" style="padding:4px 8px;">edit</button>
                        <button class="nm-btn btn-delete-video" data-id="${v.id}" style="padding:4px 8px;color:var(--danger-color);">delete</button>
                    </td>
                </tr>`).join('');

            tbody.querySelectorAll('.btn-edit-video').forEach(btn => {
                btn.onclick = () => ui.editVideo(btn.dataset.id, btn.dataset.url, btn.dataset.aid, btn.dataset.cid, btn.dataset.title);
            });
            tbody.querySelectorAll('.btn-delete-video').forEach(btn => {
                btn.onclick = () => ui.deleteVideo(btn.dataset.id);
            });
        },

        editVideo(id, url, aid, cid, title) {
            editingVideoId = id;
            document.getElementById('new-url').value = url;
            document.getElementById('new-video-title').value = title;
            document.getElementById('select-actor').value = aid;
            document.getElementById('select-category').value = cid;
            document.getElementById('btn-add-video').innerText = "update";
            document.getElementById('btn-cancel-video').style.display = "inline-block";
        },

        async deleteVideo(id) {
            if (confirm('Delete?')) {
                await api.deleteVideo(id);
                await ui.loadVideos();
            }
        },

        async handleAddVideo() {
            const url = document.getElementById('new-url').value;
            const title = document.getElementById('new-video-title').value;
            if (!url) return;

            const now = new Date().toISOString();
            const p = {
                url,
                video_title: title,
                actor_id: document.getElementById('select-actor').value,
                category_id: document.getElementById('select-category').value,
                updated_at: now,
                updater_id: currentUser.id
            };

            if (editingVideoId) {
                await api.updateVideo(editingVideoId, p);
            } else {
                await api.addVideo({ ...p, created_at: now, creator_id: currentUser.id });
            }
            ui.resetVideoForm();
            await ui.loadVideos();
        },

        resetVideoForm() {
            editingVideoId = null;
            document.getElementById('new-url').value = '';
            document.getElementById('new-video-title').value = '';
            document.getElementById('btn-add-video').innerText = "add";
            document.getElementById('btn-cancel-video').style.display = "none";
        },

        async loadActors() {
            const data = await api.fetchActors();
            const tbody = document.querySelector('#table-actor tbody');
            tbody.innerHTML = data.map(a => `
                <tr>
                    <td data-label="Name">${a.actor_name}</td>
                    <td data-label="Date">${fmtDate(a.created_at)}</td>
                    <td data-label="By">${userCache[a.creator_id] || '-'}</td>
                    <td data-label="Action">
                        <button class="nm-btn btn-edit-actor" data-id="${a.id}" data-name="${a.actor_name}">edit</button>
                        <button class="nm-btn btn-delete-actor" data-id="${a.id}" style="color:var(--danger-color);">delete</button>
                    </td>
                </tr>`).join('');

            tbody.querySelectorAll('.btn-edit-actor').forEach(btn => {
                btn.onclick = () => ui.editActor(btn.dataset.id, btn.dataset.name);
            });
            tbody.querySelectorAll('.btn-delete-actor').forEach(btn => {
                btn.onclick = () => ui.deleteActor(btn.dataset.id);
            });
        },

        editActor(id, name) {
            editingActorId = id;
            document.getElementById('new-actor-name').value = name;
            document.getElementById('btn-add-actor').innerText = "update";
            document.getElementById('btn-cancel-actor').style.display = "inline-block";
        },

        async handleAddActor() {
            const name = document.getElementById('new-actor-name').value;
            if (!name) return;
            const now = new Date().toISOString();

            if (editingActorId) {
                await api.updateActor(editingActorId, { actor_name: name, updated_at: now, updater_id: currentUser.id });
            } else {
                await api.addActor({ actor_name: name, created_at: now, updated_at: now, creator_id: currentUser.id, updater_id: currentUser.id });
            }
            ui.resetActorForm();
            await ui.loadActors();
        },

        async deleteActor(id) {
            if (confirm('Delete?')) {
                const { error } = await api.deleteActor(id);
                if (error) alert('Linked to video');
                else await ui.loadActors();
            }
        },

        resetActorForm() {
            editingActorId = null;
            document.getElementById('new-actor-name').value = '';
            document.getElementById('btn-add-actor').innerText = "add";
            document.getElementById('btn-cancel-actor').style.display = "none";
        },

        async loadCategories() {
            const data = await api.fetchCategories();
            const tbody = document.querySelector('#table-category tbody');
            tbody.innerHTML = data.map(c => `
                <tr>
                    <td data-label="Category">${c.category_name}</td>
                    <td data-label="Updated">${fmtDate(c.updated_at)}</td>
                    <td data-label="By">${userCache[c.updater_id] || '-'}</td>
                    <td data-label="Action">
                        <button class="nm-btn btn-edit-category" data-id="${c.id}" data-name="${c.category_name}">edit</button>
                        <button class="nm-btn btn-delete-category" data-id="${c.id}" style="color:var(--danger-color);">delete</button>
                    </td>
                </tr>`).join('');

            tbody.querySelectorAll('.btn-edit-category').forEach(btn => {
                btn.onclick = () => ui.editCategory(btn.dataset.id, btn.dataset.name);
            });
            tbody.querySelectorAll('.btn-delete-category').forEach(btn => {
                btn.onclick = () => ui.deleteCategory(btn.dataset.id);
            });
        },

        editCategory(id, name) {
            editingCategoryId = id;
            document.getElementById('new-category-name').value = name;
            document.getElementById('btn-add-category').innerText = "update";
            document.getElementById('btn-cancel-category').style.display = "inline-block";
        },

        async handleAddCategory() {
            const name = document.getElementById('new-category-name').value;
            if (!name) return;
            const now = new Date().toISOString();

            if (editingCategoryId) {
                await api.updateCategory(editingCategoryId, { category_name: name, updated_at: now, updater_id: currentUser.id });
            } else {
                await api.addCategory({ category_name: name, created_at: now, updated_at: now, creator_id: currentUser.id, updater_id: currentUser.id });
            }
            ui.resetCategoryForm();
            await ui.loadCategories();
        },

        async deleteCategory(id) {
            if (confirm('Delete?')) {
                const { error } = await api.deleteCategory(id);
                if (error) alert('Linked to video');
                else await ui.loadCategories();
            }
        },

        resetCategoryForm() {
            editingCategoryId = null;
            document.getElementById('new-category-name').value = '';
            document.getElementById('btn-add-category').innerText = "add";
            document.getElementById('btn-cancel-category').style.display = "none";
        },

        setupGlobalEvents() {
            ui.elements.sidebar.classList.remove('open');
            ui.elements.overlay.classList.remove('active');

            document.getElementById('btn-menu-open').onclick = () => { ui.elements.sidebar.classList.add('open'); ui.elements.overlay.classList.add('active'); };
            ui.elements.overlay.onclick = () => { ui.elements.sidebar.classList.remove('open'); ui.elements.overlay.classList.remove('active'); };

            // Nav buttons
            document.querySelectorAll('nav .nm-btn').forEach(btn => {
                const onclickAttr = btn.getAttribute('onclick');
                if (onclickAttr && onclickAttr.includes('showScreen')) {
                    const screenId = onclickAttr.match(/'([^']+)'/)[1];
                    btn.removeAttribute('onclick');
                    btn.addEventListener('click', () => ui.showScreen(screenId));
                }
            });

            // Theme switches
            document.getElementById('toggle-theme').onclick = ui.toggleTheme;
            document.getElementById('toggle-theme-mob').onclick = ui.toggleTheme;

            // Video Screen Events
            const btnAddVideo = document.getElementById('btn-add-video');
            if (btnAddVideo) btnAddVideo.onclick = ui.handleAddVideo;

            const btnCancelVideo = document.getElementById('btn-cancel-video');
            if (btnCancelVideo) btnCancelVideo.onclick = ui.resetVideoForm;

            const searchBox = document.getElementById('search-box');
            if (searchBox) searchBox.oninput = ui.filterVideos;

            const filterActor = document.getElementById('filter-actor');
            if (filterActor) filterActor.onchange = ui.filterVideos;

            // Actor Screen Events
            const btnAddActor = document.getElementById('btn-add-actor');
            if (btnAddActor) btnAddActor.onclick = ui.handleAddActor;

            const btnCancelActor = document.getElementById('btn-cancel-actor');
            if (btnCancelActor) btnCancelActor.onclick = ui.resetActorForm;

            // Category Screen Events
            const btnAddCategory = document.getElementById('btn-add-category');
            if (btnAddCategory) btnAddCategory.onclick = ui.handleAddCategory;

            const btnCancelCategory = document.getElementById('btn-cancel-category');
            if (btnCancelCategory) btnCancelCategory.onclick = ui.resetCategoryForm;
        }
    };

    // --- Initiation ---
    const init = async () => {
        // PWA Service Worker (Inline simple registration to avoid extra file fetch)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('data:text/javascript;base64,c2VsZi5hZGRFdmVudExpc3RlbmVyKCdmZXRjaCcsIGV2ZW50ID0+IHt9KTs=');
        }

        try {
            const { data: user, error } = await api.fetchAdminUser();
            if (error || !user) {
                alert('Error: admin account not found in m_user table.');
                return;
            }

            ui.setInitialUser(user);
            ui.setupGlobalEvents();
            await ui.showScreen('dashboard');

        } catch (e) {
            console.error(e);
            alert('Connection Error');
        }
    };

    return { init };
})();

// Start App
window.addEventListener('DOMContentLoaded', VideoManager.init);
