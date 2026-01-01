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

    const getThumbnailUrl = (url) => {
        if (!url) return null;
        try {
            const urlObj = new URL(url);
            // YouTube
            if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
                let vid = '';
                if (urlObj.hostname.includes('youtu.be')) vid = urlObj.pathname.slice(1);
                else vid = urlObj.searchParams.get('v');
                if (vid) return `https://img.youtube.com/vi/${vid}/mqdefault.jpg`;
            }
            // Vimeo
            if (urlObj.hostname.includes('vimeo.com')) {
                const vid = urlObj.pathname.split('/').pop();
                if (vid) return `https://vumbnail.com/${vid}.jpg`;
            }
            // DailyMotion
            if (urlObj.hostname.includes('dailymotion.com') || urlObj.hostname.includes('dai.ly')) {
                const vid = urlObj.pathname.split('/').pop();
                if (vid) return `https://www.dailymotion.com/thumbnail/video/${vid}`;
            }
        } catch (e) { }

        // Generic Fallback using Thum.io
        return `https://image.thum.io/get/width/300/crop/600/${url}`;
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
            const { data } = await db.from('url').select(`
                id, url, video_title, created_at, creator_id, updated_at, updater_id,
                url_actors ( actor_id, m_actor (id, actor_name) ),
                url_categories ( category_id, m_category (id, category_name) )
            `).order('created_at', { ascending: false });
            return data || [];
        },
        async addVideo(videoData) {
            // 1. urlテーブルに基本情報を登録し、新しいIDを取得
            const { data: urlData, error: urlError } = await db.from('url').insert({
                url: videoData.url,
                video_title: videoData.video_title,
                created_at: videoData.created_at,
                creator_id: videoData.creator_id,
                updated_at: videoData.updated_at,
                updater_id: videoData.updater_id
            }).select().single();

            if (urlError) {
                console.error('Error adding video:', urlError);
                return { error: urlError };
            }
            const newUrlId = urlData.id;

            // 2. url_actorsに関連を登録
            if (videoData.actor_ids && videoData.actor_ids.length > 0) {
                const actorLinks = videoData.actor_ids.map(actor_id => ({ url_id: newUrlId, actor_id }));
                const { error } = await db.from('url_actors').insert(actorLinks);
                if (error) return { error }; // エラー時はここで中断
            }

            // 3. url_categoriesに関連を登録
            if (videoData.category_ids && videoData.category_ids.length > 0) {
                const categoryLinks = videoData.category_ids.map(category_id => ({ url_id: newUrlId, category_id }));
                const { error } = await db.from('url_categories').insert(categoryLinks);
                if (error) return { error }; // エラー時はここで中断
            }

            return { data: urlData, error: null };
        },
        async updateVideo(id, videoData) {
            // 1. urlテーブルの基本情報を更新
            const { error: updateError } = await db.from('url').update({
                url: videoData.url,
                video_title: videoData.video_title,
                updated_at: videoData.updated_at,
                updater_id: videoData.updater_id
            }).eq('id', id);

            if (updateError) return { error: updateError };

            // 2. 既存の関連を中間テーブルから削除
            await db.from('url_actors').delete().eq('url_id', id);
            await db.from('url_categories').delete().eq('url_id', id);

            // 3. 新しい関連を登録 (addVideoと同様)
            if (videoData.actor_ids && videoData.actor_ids.length > 0) {
                const actorLinks = videoData.actor_ids.map(actor_id => ({ url_id: id, actor_id }));
                const { error } = await db.from('url_actors').insert(actorLinks);
                if (error) return { error };
            }

            if (videoData.category_ids && videoData.category_ids.length > 0) {
                const categoryLinks = videoData.category_ids.map(category_id => ({ url_id: id, category_id }));
                const { error } = await db.from('url_categories').insert(categoryLinks);
                if (error) return { error };
            }

            return { error: null };
        },
        async deleteVideo(id) {
            // DB側でON DELETE CASCADEを設定済みのため、urlを削除すれば中間テーブルのデータも自動で削除される
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

            // Load theme settings
            const savedAccent = localStorage.getItem('accent-color') || '#4b7cf3';
            ui.setAccentColor(savedAccent);
            const picker = document.getElementById('accent-color-picker');
            if (picker) {
                picker.value = savedAccent;
                picker.oninput = (e) => ui.setAccentColor(e.target.value);
            }

            ui.elements.loadingOverlay.style.display = 'none';
            ui.elements.sidebar.style.display = 'block';
            ui.elements.mainContent.style.display = 'block';
            if (window.innerWidth <= 768) ui.elements.mobileHeader.style.display = 'flex';
        },

        setAccentColor(color) {
            document.documentElement.style.setProperty('--accent-color', color);
            localStorage.setItem('accent-color', color);
        },

        showSkeleton(targetId, rowCount = 5) {
            const tbody = document.querySelector(`#${targetId} tbody`);
            if (!tbody) return;
            const colCount = document.querySelectorAll(`#${targetId} thead th`).length;
            tbody.innerHTML = Array(rowCount).fill(0).map(() => `
                <tr class="skeleton-row">
                    ${Array(colCount).fill(0).map(() => `<td><div class="skeleton-pulse"></div></td>`).join('')}
                </tr>
            `).join('');
        },

        toggleTheme() {
            const theme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            document.body.setAttribute('data-theme', theme);
        },

        async showScreen(id) {
            document.querySelectorAll('.screen').forEach(s => {
                s.classList.remove('active');
                s.classList.remove('fade-in');
            });
            const screen = document.getElementById(id + '-screen');
            if (screen) {
                screen.classList.add('active');
                screen.classList.add('fade-in');
            }

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
        
        // --- Custom Select Logic ---
        createCustomSelect(type) {
            const container = document.getElementById(`custom-select-${type}`);
            const display = container.querySelector('.custom-select-display');
            const optionsContainer = container.querySelector('.custom-select-options');

            display.addEventListener('click', () => {
                optionsContainer.classList.toggle('open');
            });

            // Close when clicking outside
            document.addEventListener('click', (e) => {
                if (!container.contains(e.target)) {
                    optionsContainer.classList.remove('open');
                }
            });
        },

        updateCustomSelectState(type) {
            const container = document.getElementById(`custom-select-${type}`);
            const chipsContainer = container.querySelector('.custom-select-chips');
            const placeholder = container.querySelector('.custom-select-placeholder');
            const selectedCheckboxes = container.querySelectorAll('input[type="checkbox"]:checked');
            
            chipsContainer.innerHTML = '';
            selectedCheckboxes.forEach(checkbox => {
                const chip = document.createElement('div');
                chip.className = 'custom-select-chip';
                chip.textContent = checkbox.nextElementSibling.textContent;
                const removeBtn = document.createElement('span');
                removeBtn.className = 'remove-chip';
                removeBtn.textContent = '×';
                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    checkbox.checked = false;
                    ui.updateCustomSelectState(type);
                };
                chip.appendChild(removeBtn);
                chipsContainer.appendChild(chip);
            });

            placeholder.style.display = selectedCheckboxes.length > 0 ? 'none' : 'block';
        },

        async refreshData() {
            const { users, actors: actorList, categories: categoryList } = await api.fetchInitialData();
            userCache = Object.fromEntries(users.map(i => [i.id, i.user_id]));
            actors = Object.fromEntries(actorList.map(i => [i.id, i.actor_name]));
            cats = Object.fromEntries(categoryList.map(i => [i.id, i.category_name]));

            // Populate custom actor select
            const actorOptionsContainer = document.querySelector('#custom-select-actor .custom-select-options');
            actorOptionsContainer.innerHTML = actorList.map(i => `
                <label class="custom-select-option">
                    <input type="checkbox" value="${i.id}">
                    <span>${i.actor_name}</span>
                </label>
            `).join('');
            actorOptionsContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                checkbox.onchange = () => ui.updateCustomSelectState('actor');
            });

            // Populate custom category select
            const categoryOptionsContainer = document.querySelector('#custom-select-category .custom-select-options');
            categoryOptionsContainer.innerHTML = categoryList.map(i => `
                <label class="custom-select-option">
                    <input type="checkbox" value="${i.id}">
                    <span>${i.category_name}</span>
                </label>
            `).join('');
            categoryOptionsContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                checkbox.onchange = () => ui.updateCustomSelectState('category');
            });
            
            // Populate filter dropdown (standard select is fine here)
            const filterActor = document.getElementById('filter-actor');
            if (filterActor) {
                const aOpts = actorList.map(i => `<option value="${i.id}">${i.actor_name}</option>`).join('');
                filterActor.innerHTML = '<option value="">All Actors</option>' + aOpts;
            }
        },

        async loadDashboard() {
            ui.showSkeleton('table-recent', 5);
            allVideos = await api.fetchVideos();
            document.getElementById('stat-video').innerText = allVideos.length;
            document.getElementById('stat-actor').innerText = Object.keys(actors).length;
            document.getElementById('stat-cat').innerText = Object.keys(cats).length;

            const tbody = document.querySelector('#table-recent tbody');
            tbody.innerHTML = allVideos.slice(0, 5).map(v => `
                <tr>
                    <td class="td-thumb" data-label="Preview">
                        <div class="thumb-container">
                            <img src="${getThumbnailUrl(v.url)}" class="thumb-img" onerror="this.src='https://via.placeholder.com/100x60?text=No+Image'">
                        </div>
                    </td>
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
                const matchActorSelect = !aid || (v.url_actors && v.url_actors.some(ua => ua.actor_id == aid));

                const vTitle = (v.video_title || "").toLowerCase();
                const vUrl = (v.url || "").toLowerCase();
                const vActors = v.url_actors ? v.url_actors.map(ua => ua.m_actor.actor_name.toLowerCase()) : [];
                const vCats = v.url_categories ? v.url_categories.map(uc => uc.m_category.category_name.toLowerCase()) : [];
                
                const searchMatch = (
                    vTitle.includes(word) ||
                    vUrl.includes(word) ||
                    vActors.some(name => name.includes(word)) ||
                    vCats.some(name => name.includes(word))
                );

                return matchActorSelect && searchMatch;
            });

            const tbody = document.querySelector('#table-video tbody');
            tbody.innerHTML = ''; // Clear previous
            ui.showSkeleton('table-video', 8);

            // Simulation of async filtering/rendering or just immediate if fast
            setTimeout(() => {
                const tbodyFinal = document.querySelector('#table-video tbody');
                tbodyFinal.innerHTML = filtered.map(v => {
                    const actorNames = v.url_actors && v.url_actors.length > 0 ? v.url_actors.map(ua => ua.m_actor.actor_name).join(', ') : '-';
                    const categoryNames = v.url_categories && v.url_categories.length > 0 ? v.url_categories.map(uc => uc.m_category.category_name).join(', ') : '-';

                    return `
                    <tr class="fade-in">
                    <td class="td-thumb" data-label="Preview">
                        <div class="thumb-container">
                            <img src="${getThumbnailUrl(v.url)}" class="thumb-img" onerror="this.src='https://via.placeholder.com/100x60?text=No+Image'">
                        </div>
                    </td>
                    <td data-label="Video Title" class="td-title">${v.video_title || '(No Title)'}</td>
                    <td data-label="URL"><a href="${v.url}" target="_blank" class="td-url">${v.url}</a></td>
                    <td data-label="Actor">${actorNames}</td>
                    <td data-label="Category">${categoryNames}</td>
                    <td data-label="Creator">${userCache[v.creator_id] || '-'}</td>
                    <td data-label="Created">${fmtDate(v.created_at)}</td>
                    <td data-label="Updater">${userCache[v.updater_id] || '-'}</td>
                    <td data-label="Updated">${fmtDate(v.updated_at)}</td>
                    <td data-label="Action">
                        <button class="nm-btn btn-edit-video" data-id="${v.id}" style="padding:4px 8px;">edit</button>
                        <button class="nm-btn btn-delete-video" data-id="${v.id}" style="padding:4px 8px;color:var(--danger-color);">delete</button>
                    </td>
                </tr>`
                }).join('');

                tbody.querySelectorAll('.btn-edit-video').forEach(btn => {
                    btn.onclick = () => ui.editVideo(btn.dataset.id);
                });
                tbody.querySelectorAll('.btn-delete-video').forEach(btn => {
                    btn.onclick = () => ui.deleteVideo(btn.dataset.id);
                });
            }, 300);
        },

        editVideo(id) {
            editingVideoId = id;
            const video = allVideos.find(v => v.id == id);
            if (!video) return;

            document.getElementById('new-url').value = video.url;
            document.getElementById('new-video-title').value = video.video_title || '';
            
            const actorIds = video.url_actors ? video.url_actors.map(ua => ua.actor_id.toString()) : [];
            document.querySelectorAll('#custom-select-actor input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = actorIds.includes(checkbox.value);
            });
            ui.updateCustomSelectState('actor');

            const categoryIds = video.url_categories ? video.url_categories.map(uc => uc.category_id.toString()) : [];
            document.querySelectorAll('#custom-select-category input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = categoryIds.includes(checkbox.value);
            });
            ui.updateCustomSelectState('category');

            document.getElementById('btn-add-video').innerText = "update";
            document.getElementById('btn-cancel-video').style.display = "inline-block";
            window.scrollTo(0, 0); // Scroll to top to see the form
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

            const actor_ids = Array.from(document.querySelectorAll('#custom-select-actor input:checked')).map(cb => cb.value);
            const category_ids = Array.from(document.querySelectorAll('#custom-select-category input:checked')).map(cb => cb.value);

            const now = new Date().toISOString();
            const p = {
                url,
                video_title: title,
                actor_ids,
                category_ids,
                updated_at: now,
                updater_id: currentUser.id
            };

            if (editingVideoId) {
                const { error } = await api.updateVideo(editingVideoId, p);
                if (error) {
                    alert('Update failed: ' + error.message);
                }
            } else {
                const { error } = await api.addVideo({ ...p, created_at: now, creator_id: currentUser.id });
                if (error) {
                    alert('Add failed: ' + error.message);
                }
            }
            ui.resetVideoForm();
            await ui.loadVideos();
        },

        resetVideoForm() {
            editingVideoId = null;
            document.getElementById('new-url').value = '';
            document.getElementById('new-video-title').value = '';

            document.querySelectorAll('#custom-select-actor input:checked').forEach(cb => cb.checked = false);
            document.querySelectorAll('#custom-select-category input:checked').forEach(cb => cb.checked = false);
            ui.updateCustomSelectState('actor');
            ui.updateCustomSelectState('category');

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
            const name = document.getElementById('new-actor-name').value.trim();
            if (!name) return;

            const lowerCaseName = name.toLowerCase();
            let isDuplicate = false;

            if (editingActorId) {
                // In edit mode, check if the new name matches another existing actor's name
                for (const id in actors) {
                    if (id !== editingActorId && actors[id].toLowerCase() === lowerCaseName) {
                        isDuplicate = true;
                        break;
                    }
                }
            } else {
                // In add mode, check if the name exists at all
                isDuplicate = Object.values(actors).some(actorName => actorName.toLowerCase() === lowerCaseName);
            }

            if (isDuplicate) {
                alert('エラー: 同じ名前の出演者が既に登録されています。');
                return;
            }
            
            const now = new Date().toISOString();

            if (editingActorId) {
                await api.updateActor(editingActorId, { actor_name: name, updated_at: now, updater_id: currentUser.id });
            } else {
                await api.addActor({ actor_name: name, created_at: now, updated_at: now, creator_id: currentUser.id, updater_id: currentUser.id });
            }
            ui.resetActorForm();
            await ui.loadActors();
            await ui.refreshData(); // Refresh dropdowns as well
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

        async handleModalAddActor() {
            const nameInput = document.getElementById('modal-new-actor-name');
            const name = nameInput.value.trim();
            if (!name) return;

            const lowerCaseName = name.toLowerCase();
            const isDuplicate = Object.values(actors).some(actorName => actorName.toLowerCase() === lowerCaseName);

            if (isDuplicate) {
                alert('エラー: 同じ名前の出演者が既に登録されています。');
                return;
            }

            const now = new Date().toISOString();
            await api.addActor({ actor_name: name, created_at: now, updated_at: now, creator_id: currentUser.id, updater_id: currentUser.id });
            
            nameInput.value = ''; // Clear input
            document.getElementById('actor-modal').style.display = 'none'; // Close modal
            
            await ui.refreshData(); // Refresh dropdowns
            
            // If on actor screen, refresh the table as well
            if (document.getElementById('actor-screen').classList.contains('active')) {
                await ui.loadActors();
            }
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
            
            // Init custom selects
            ui.createCustomSelect('actor');
            ui.createCustomSelect('category');

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

            // Actor Modal Events
            const actorModal = document.getElementById('actor-modal');
            const btnShowActorModal = document.getElementById('btn-show-actor-modal');
            const btnModalCancelActor = document.getElementById('btn-modal-cancel-actor');
            const btnModalAddActor = document.getElementById('btn-modal-add-actor');

            if (btnShowActorModal) {
                btnShowActorModal.onclick = () => {
                    actorModal.style.display = 'flex';
                };
            }
            if (btnModalCancelActor) {
                btnModalCancelActor.onclick = () => {
                    document.getElementById('modal-new-actor-name').value = '';
                    actorModal.style.display = 'none';
                };
            }
            if (btnModalAddActor) {
                btnModalAddActor.onclick = ui.handleModalAddActor;
            }
            // Close modal when clicking outside of it
            if (actorModal) {
                actorModal.onclick = (e) => {
                    if (e.target === actorModal) {
                        document.getElementById('modal-new-actor-name').value = '';
                        actorModal.style.display = 'none';
                    }
                };
            }
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

// --- Scroll into view on focus for mobile ---
window.addEventListener('DOMContentLoaded', () => {
    const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile()) {
        const inputs = document.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            input.addEventListener('focus', () => {
                setTimeout(() => {
                    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            });
        });
    }
});