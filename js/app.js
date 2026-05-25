/* Habit Tracker (Static) - dependency-free */
(() => {
  const APP_KEY = "ht_v1";

  const nowIsoDate = () => new Date().toISOString().slice(0, 10);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const uid = () => Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);

  const defaultState = () => ({
    auth: { userId: null },
    users: [],
    habits: [],
    completions: [], // {id, userId, habitId, date, at}
    notifications: [], // {id,userId,type,message,scheduledAt,createdAt,read}
    posts: [], // {id,userId,body,createdAt,likes:[],comments:[{id,userId,body,createdAt}]}
    settings: { theme: "dark", sound: true, focusMode: false, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Local" },
    gamification: { xpByUser: {}, coinsByUser: {}, levelByUser: {}, achievementsByUser: {} },
  });

  const store = {
    read() {
      try {
        const raw = localStorage.getItem(APP_KEY);
        if (!raw) return defaultState();
        const parsed = JSON.parse(raw);
        return { ...defaultState(), ...parsed };
      } catch {
        return defaultState();
      }
    },
    write(next) {
      localStorage.setItem(APP_KEY, JSON.stringify(next));
    },
    update(fn) {
      const s = store.read();
      const next = fn(structuredClone ? structuredClone(s) : JSON.parse(JSON.stringify(s)));
      store.write(next);
      return next;
    },
  };

  const ui = {
    qs(sel, root = document) { return root.querySelector(sel); },
    qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); },
    fmtDate(iso) {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
    },
    toast(title, message) {
      const t = document.createElement("div");
      t.className = "toast";
      t.innerHTML = `<div class="t">${escapeHtml(title)}</div><div class="m">${escapeHtml(message)}</div>`;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 2800);
    },
    confetti() {
      const wrap = document.createElement("div");
      wrap.className = "confetti";
      const colors = ["#7C5CFF", "#2EE59D", "#FFB020", "#FF4D6D", "#64D2FF"];
      for (let i = 0; i < 90; i++) {
        const piece = document.createElement("i");
        piece.style.left = Math.random() * 100 + "vw";
        piece.style.top = (-20 - Math.random() * 40) + "px";
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = (Math.random() * 0.25) + "s";
        piece.style.transform = `translateY(-20px) rotate(${Math.random() * 360}deg)`;
        wrap.appendChild(piece);
      }
      document.body.appendChild(wrap);
      setTimeout(() => wrap.remove(), 1400);
    },
    setTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme);
    },
    openModal(id) {
      const wrap = ui.qs(`#${id}`);
      if (!wrap) return;
      wrap.classList.add("open");
    },
    closeModal(id) {
      const wrap = ui.qs(`#${id}`);
      if (!wrap) return;
      wrap.classList.remove("open");
    },
  };

  const escapeHtml = (s) => ("" + s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const auth = {
    currentUser(state) {
      if (!state.auth.userId) return null;
      return state.users.find(u => u.id === state.auth.userId) || null;
    },
    requireLogin() {
      const s = store.read();
      const user = auth.currentUser(s);
      if (!user) {
        location.href = "auth.html";
        return null;
      }
      return user;
    },
    signup({ username, email, password }) {
      email = (email || "").trim().toLowerCase();
      username = (username || "").trim();
      if (!username || username.length < 2) return { ok: false, error: "Username must be at least 2 characters." };
      if (!email.includes("@")) return { ok: false, error: "Please enter a valid email." };
      if (!password || password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

      const s = store.read();
      if (s.users.some(u => u.email === email)) return { ok: false, error: "Email already registered." };
      const id = uid();
      const user = { id, username, email, passwordHash: hash(password), avatar: "", bio: "", goals: "Build a 30-day consistency streak." };

      store.write({
        ...s,
        auth: { userId: id },
        users: [...s.users, user],
      });

      gamification.ensureUser(id);
      demoSeedIfEmpty(id);
      return { ok: true };
    },
    login({ email, password }) {
      email = (email || "").trim().toLowerCase();
      const s = store.read();
      const user = s.users.find(u => u.email === email);
      if (!user) return { ok: false, error: "No account found for this email." };
      if (user.passwordHash !== hash(password || "")) return { ok: false, error: "Incorrect password." };
      store.write({ ...s, auth: { userId: user.id } });
      gamification.ensureUser(user.id);
      return { ok: true };
    },
    logout() {
      store.update(s => ({ ...s, auth: { userId: null } }));
      location.href = "index.html";
    },
  };

  // lightweight hash (NOT secure; static demo only)
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  const gamification = {
    ensureUser(userId) {
      store.update(s => {
        const g = { ...s.gamification };
        g.xpByUser ||= {};
        g.coinsByUser ||= {};
        g.levelByUser ||= {};
        g.achievementsByUser ||= {};
        if (g.xpByUser[userId] == null) g.xpByUser[userId] = 0;
        if (g.coinsByUser[userId] == null) g.coinsByUser[userId] = 0;
        if (g.levelByUser[userId] == null) g.levelByUser[userId] = 1;
        if (g.achievementsByUser[userId] == null) g.achievementsByUser[userId] = [];
        return { ...s, gamification: g };
      });
    },
    xpToNext(level) {
      return 80 + (level - 1) * 45;
    },
    addXP(userId, amount, reason = "Progress") {
      amount = Math.max(0, Math.floor(amount));
      store.update(s => {
        const g = { ...s.gamification };
        const xp = (g.xpByUser[userId] || 0) + amount;
        let level = g.levelByUser[userId] || 1;
        let remainingXp = xp;
        while (remainingXp >= gamification.xpToNext(level)) {
          remainingXp -= gamification.xpToNext(level);
          level += 1;
        }
        g.xpByUser[userId] = remainingXp;
        g.levelByUser[userId] = level;
        g.coinsByUser[userId] = (g.coinsByUser[userId] || 0) + Math.ceil(amount / 4);
        return { ...s, gamification: g };
      });
      ui.toast("XP earned", `${reason}: +${amount} XP`);
    },
    unlock(userId, key, title) {
      let unlocked = false;
      store.update(s => {
        const g = { ...s.gamification };
        const list = g.achievementsByUser[userId] || [];
        if (!list.includes(key)) {
          g.achievementsByUser[userId] = [...list, key];
          unlocked = true;
        }
        return { ...s, gamification: g };
      });
      if (unlocked) {
        ui.confetti();
        ui.toast("Achievement unlocked", title);
        gamification.addXP(userId, 30, "Achievement");
      }
    },
  };

  const habits = {
    listForUser(state, userId) {
      return state.habits
        .filter(h => h.userId === userId && !h.archived)
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    },
    completedOnDate(state, userId, dateIso) {
      const set = new Set(
        state.completions
          .filter(c => c.userId === userId && c.date === dateIso)
          .map(c => c.habitId)
      );
      return set;
    },
    toggleComplete(userId, habitId, dateIso = nowIsoDate()) {
      let changedToComplete = false;
      store.update(s => {
        const existing = s.completions.find(c => c.userId === userId && c.habitId === habitId && c.date === dateIso);
        if (existing) {
          return { ...s, completions: s.completions.filter(c => c.id !== existing.id) };
        }
        changedToComplete = true;
        return {
          ...s,
          completions: [...s.completions, { id: uid(), userId, habitId, date: dateIso, at: new Date().toISOString() }],
        };
      });
      if (changedToComplete) {
        gamification.addXP(userId, 10, "Habit completed");
        habits.checkAchievements(userId);
      }
    },
    streakForHabit(state, userId, habitId) {
      const dates = state.completions
        .filter(c => c.userId === userId && c.habitId === habitId)
        .map(c => c.date)
        .sort();
      if (!dates.length) return { current: 0, longest: 0 };
      const set = new Set(dates);
      let current = 0;
      let d = new Date();
      for (;;) {
        const iso = d.toISOString().slice(0, 10);
        if (!set.has(iso)) break;
        current++;
        d.setDate(d.getDate() - 1);
      }
      let longest = 0, run = 0;
      const start = new Date(dates[0]);
      const end = new Date(dates[dates.length - 1]);
      for (let dd = new Date(start); dd <= end; dd.setDate(dd.getDate() + 1)) {
        const iso = dd.toISOString().slice(0, 10);
        if (set.has(iso)) { run++; longest = Math.max(longest, run); }
        else run = 0;
      }
      return { current, longest };
    },
    weeklyStats(state, userId) {
      const today = new Date();
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const iso = d.toISOString().slice(0, 10);
        days.push(iso);
      }
      const userHabits = habits.listForUser(state, userId);
      const totalPossible = userHabits.length * 7;
      let done = 0;
      const perDay = days.map(iso => {
        const completed = state.completions.filter(c => c.userId === userId && c.date === iso).length;
        done += completed;
        return { date: iso, completed };
      });
      return { perDay, done, totalPossible, rate: totalPossible ? done / totalPossible : 0 };
    },
    monthHeatmap(state, userId, year, monthIndex) {
      const first = new Date(year, monthIndex, 1);
      const last = new Date(year, monthIndex + 1, 0);
      const byDate = new Map();
      for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        const completed = state.completions.filter(c => c.userId === userId && c.date === iso).length;
        byDate.set(iso, completed);
      }
      return { first, last, byDate };
    },
    checkAchievements(userId) {
      const s = store.read();
      const all = habits.listForUser(s, userId);
      if (all.length >= 5) gamification.unlock(userId, "habits_5", "Habit Builder (5 habits)");
      const w = habits.weeklyStats(s, userId);
      if (w.rate >= 0.85 && w.totalPossible >= 14) gamification.unlock(userId, "week_elite", "Weekly Elite (85%+)");
      const best = all.reduce((acc, h) => {
        const st = habits.streakForHabit(s, userId, h.id);
        return Math.max(acc, st.current);
      }, 0);
      if (best >= 7) gamification.unlock(userId, "streak_7", "7‑Day Streak");
      if (best >= 30) gamification.unlock(userId, "streak_30", "30‑Day Legend");
    },
  };

  const notifications = {
    add(userId, { type, message, scheduledAt }) {
      store.update(s => ({
        ...s,
        notifications: [
          { id: uid(), userId, type, message, scheduledAt: scheduledAt || null, createdAt: new Date().toISOString(), read: false },
          ...s.notifications,
        ],
      }));
    },
    markRead(userId) {
      store.update(s => ({
        ...s,
        notifications: s.notifications.map(n => (n.userId === userId ? { ...n, read: true } : n)),
      }));
    },
  };

  function demoSeedIfEmpty(userId) {
    const s = store.read();
    if (s.habits.some(h => h.userId === userId)) return;
    const palette = ["#7C5CFF", "#2EE59D", "#FFB020", "#64D2FF", "#FF4D6D"];
    const seed = [
      ["Drink Water", "Hydrate for focus and energy", "Health", "Daily", "Easy"],
      ["10-min Walk", "Keep the streak alive with movement", "Fitness", "Daily", "Easy"],
      ["Read 10 Pages", "Compound knowledge daily", "Learning", "Daily", "Medium"],
      ["Meditate", "Calm mind, sharpen attention", "Mindfulness", "Daily", "Medium"],
      ["No Screens After 11pm", "Protect sleep quality", "Sleep", "Daily", "Hard"],
    ];
    store.update(state => {
      const add = seed.map((row, i) => ({
        id: uid(),
        userId,
        title: row[0],
        description: row[1],
        category: row[2],
        frequency: row[3],
        difficulty: row[4],
        reminderTime: "20:30",
        icon: "✓",
        color: palette[i % palette.length],
        archived: false,
        notes: "",
        priority: i + 1,
        order: i + 1,
        createdAt: new Date().toISOString(),
      }));
      return { ...state, habits: [...state.habits, ...add] };
    });
  }

  function initTheme() {
    const s = store.read();
    const theme = s.settings?.theme || "dark";
    ui.setTheme(theme);
  }

  function injectAppShell(pageKey, pageTitle) {
    initTheme();
    const s = store.read();
    const user = auth.currentUser(s);
    const links = [
      ["dashboard.html", "Dashboard"],
      ["habits.html", "Habits"],
      ["analytics.html", "Analytics"],
      ["calendar.html", "Calendar"],
      ["rewards.html", "Rewards"],
      ["reminders.html", "Reminders"],
      ["community.html", "Community"],
      ["settings.html", "Settings"],
    ];
    const sidebar = document.createElement("aside");
    sidebar.className = "sidebar glass";
    sidebar.id = "sidebar";
    sidebar.innerHTML = `
      <div class="brand glass">
        <div style="display:flex; gap:12px; align-items:center;">
          <div class="logo">H</div>
          <div>
            <h1>HabitFlow</h1>
            <p class="sub">Consistency, beautifully</p>
          </div>
        </div>
        <button class="btn small ghost" id="closeSidebarBtn" title="Close">✕</button>
      </div>
      <nav class="nav">
        ${links.map(([href, label]) => `<a href="${href}" class="${href === pageKey ? "active" : ""}">${iconFor(label)}<span>${label}</span></a>`).join("")}
      </nav>
      <div class="sidebarFooter glass">
        <div class="miniRow">
          <div style="min-width:0">
            <div style="font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${user ? escapeHtml(user.username) : "Guest"}</div>
            <div class="muted" style="font-size:12px">${user ? escapeHtml(user.email) : "Not signed in"}</div>
          </div>
          <button class="btn small" id="themeToggleBtn" title="Toggle theme">🌓</button>
        </div>
        <div style="display:flex; gap:10px; margin-top:10px">
          <button class="btn small" id="focusToggleBtn" style="flex:1">Focus</button>
          <button class="btn small danger" id="logoutBtn" style="flex:1">Logout</button>
        </div>
      </div>
    `;

    const main = document.createElement("main");
    main.className = "main";
    main.innerHTML = `
      <div class="topbar">
        <div class="left">
          <button class="btn small" id="openSidebarBtn" title="Menu">☰</button>
          <div>
            <h2>${escapeHtml(pageTitle)}</h2>
            <div class="muted" style="font-size:12px">Today: ${ui.fmtDate(new Date().toISOString())}</div>
          </div>
        </div>
        <div class="search">
          <span class="muted">⌕</span>
          <input id="globalSearch" placeholder="Search habits, posts, notifications..." />
        </div>
        <div style="display:flex; gap:10px; align-items:center">
          <button class="btn small" id="notifyBtn" title="Notifications">🔔</button>
        </div>
      </div>
      <div class="content" id="pageRoot"></div>
    `;

    const app = document.createElement("div");
    app.className = "app";
    app.appendChild(sidebar);
    app.appendChild(main);
    document.body.appendChild(app);

    // Mobile backdrop + interactions
    let backdrop = null;
    const closeSidebar = () => {
      sidebar.classList.remove("open");
      if (backdrop) backdrop.remove();
      backdrop = null;
    };
    const openSidebar = () => {
      sidebar.classList.add("open");
      backdrop = document.createElement("div");
      backdrop.className = "backdrop";
      backdrop.addEventListener("click", closeSidebar);
      document.body.appendChild(backdrop);
    };

    ui.qs("#openSidebarBtn").addEventListener("click", openSidebar);
    ui.qs("#closeSidebarBtn").addEventListener("click", closeSidebar);

    ui.qs("#logoutBtn").addEventListener("click", auth.logout);
    ui.qs("#themeToggleBtn").addEventListener("click", () => {
      store.update(st => {
        const nextTheme = (st.settings?.theme || "dark") === "dark" ? "light" : "dark";
        const next = { ...st, settings: { ...st.settings, theme: nextTheme } };
        return next;
      });
      initTheme();
    });
    ui.qs("#focusToggleBtn").addEventListener("click", () => {
      const next = store.update(st => ({ ...st, settings: { ...st.settings, focusMode: !st.settings.focusMode } }));
      applyFocusMode(next.settings.focusMode);
    });
    ui.qs("#notifyBtn").addEventListener("click", () => ui.openModal("notificationsModal"));
    ui.qs("#globalSearch").addEventListener("input", (e) => {
      const q = (e.target.value || "").trim().toLowerCase();
      document.dispatchEvent(new CustomEvent("ht:search", { detail: { q } }));
    });

    applyFocusMode(s.settings.focusMode);
    injectNotificationsModal();
  }

  function iconFor(label) {
    const map = {
      Dashboard: "✨",
      Habits: "✅",
      Analytics: "📈",
      Calendar: "🗓️",
      Rewards: "🏆",
      Reminders: "⏰",
      Community: "👥",
      Settings: "⚙️",
    };
    return `<span style="width:20px; text-align:center">${map[label] || "•"}</span>`;
  }

  function applyFocusMode(on) {
    document.documentElement.style.filter = on ? "saturate(0.92) contrast(1.03)" : "";
    document.body.style.background = on
      ? `radial-gradient(1000px 700px at 50% 0%, rgba(124,92,255,.18), transparent 60%), linear-gradient(180deg,var(--bg0),var(--bg1))`
      : "";
  }

  function injectNotificationsModal() {
    if (ui.qs("#notificationsModal")) return;
    const wrap = document.createElement("div");
    wrap.className = "modalWrap";
    wrap.id = "notificationsModal";
    wrap.innerHTML = `
      <div class="modalBackdrop" data-close="1"></div>
      <div class="modal glass">
        <div class="row">
          <h3 class="modalTitle">Notifications</h3>
          <div style="display:flex; gap:10px">
            <button class="btn small" id="markReadBtn">Mark read</button>
            <button class="btn small" data-close="1">Close</button>
          </div>
        </div>
        <div class="divider"></div>
        <div id="notificationsList" class="grid" style="gap:10px"></div>
      </div>
    `;
    document.body.appendChild(wrap);
    wrap.addEventListener("click", (e) => {
      const el = e.target;
      if (el && el.getAttribute && el.getAttribute("data-close") === "1") ui.closeModal("notificationsModal");
    });
    ui.qs("#markReadBtn").addEventListener("click", () => {
      const s = store.read();
      const user = auth.currentUser(s);
      if (!user) return;
      notifications.markRead(user.id);
      renderNotifications();
      ui.toast("Updated", "All notifications marked as read.");
    });
    renderNotifications();
  }

  function renderNotifications() {
    const s = store.read();
    const user = auth.currentUser(s);
    const root = ui.qs("#notificationsList");
    if (!root) return;
    if (!user) { root.innerHTML = `<div class="muted">Sign in to view notifications.</div>`; return; }
    const list = s.notifications.filter(n => n.userId === user.id).slice(0, 25);
    if (!list.length) { root.innerHTML = `<div class="muted">No notifications yet.</div>`; return; }
    root.innerHTML = list.map(n => `
      <div class="glass" style="padding:12px; border-radius:16px">
        <div class="row">
          <div style="font-weight:800">${escapeHtml(n.type || "Info")}${n.read ? "" : " •"}</div>
          <div class="muted" style="font-size:12px">${ui.fmtDate(n.createdAt)}</div>
        </div>
        <div class="muted" style="margin-top:6px; line-height:1.45">${escapeHtml(n.message || "")}</div>
        ${n.scheduledAt ? `<div class="muted" style="margin-top:6px; font-size:12px">Scheduled: ${escapeHtml(n.scheduledAt)}</div>` : ""}
      </div>
    `).join("");
  }

  // ===== Pages =====
  const pages = {
    landing() {
      initTheme();
      const root = ui.qs("#root");
      const s = store.read();
      const user = auth.currentUser(s);
      root.innerHTML = `
        <div class="landingNav">
          <div class="container landingNavRow">
            <div style="display:flex; align-items:center; gap:12px">
              <div class="pill"><span style="font-weight:900">HabitFlow</span><span class="muted">•</span><span class="muted">Premium Habit Tracker</span></div>
            </div>
            <div class="links">
              <a href="#features">Features</a>
              <a href="#testimonials">Stories</a>
              <a href="#pricing">Pricing</a>
              <a href="#footer">Contact</a>
            </div>
            <div style="display:flex; gap:10px; align-items:center">
              <button class="btn small" id="landingThemeBtn" title="Toggle theme">🌓</button>
              <a class="btn small ${user ? "primary" : ""}" href="${user ? "dashboard.html" : "auth.html"}">${user ? "Open app" : "Get started"}</a>
            </div>
          </div>
        </div>

        <div class="container">
          <section class="hero">
            <div class="heroCard glass">
              <div class="pill">✨ Streaks • Analytics • Rewards</div>
              <h1>Build habits that stick.<br/>Track progress like a pro.</h1>
              <p>
                HabitFlow is a premium, fast habit tracker with streaks, insights, reminders, and a playful rewards system —
                designed to keep you consistent without feeling overwhelmed.
              </p>
              <div class="heroActions">
                <a class="btn primary" href="${user ? "habits.html" : "auth.html"}">Start tracking</a>
                <a class="btn" href="#features">See features</a>
              </div>
              <div class="statGrid">
                <div class="stat glass">
                  <div class="k" id="statHabits">5+</div>
                  <div class="l">Smart templates included</div>
                </div>
                <div class="stat glass">
                  <div class="k">7‑day</div>
                  <div class="l">Weekly consistency tracking</div>
                </div>
                <div class="stat glass">
                  <div class="k">1‑click</div>
                  <div class="l">Complete habits instantly</div>
                </div>
              </div>
            </div>
            <div class="illus">
              <div class="blob"></div>
              <div class="blob b2"></div>
              <div class="cardlet glass">
                <div class="row">
                  <div>
                    <div style="font-weight:900; font-size:14px">Today’s Focus</div>
                    <div class="muted" style="font-size:12px; margin-top:4px">Small actions. Big momentum.</div>
                  </div>
                  <div class="ring">◎</div>
                </div>
                <div class="bars">
                  <div class="bar"><i></i></div>
                  <div class="bar"><i></i></div>
                  <div class="bar"><i></i></div>
                </div>
              </div>
            </div>
          </section>

          <section id="features" class="section">
            <h3>Everything you need to stay consistent</h3>
            <div class="cards">
              ${featureCard("Daily habits", "Create routines with categories, difficulty, reminders, and priorities.")}
              ${featureCard("Streak engine", "Track current & longest streaks and protect them with smart warnings.")}
              ${featureCard("Analytics", "Weekly + monthly trends, category breakdown, and a productivity heatmap.")}
              ${featureCard("Gamification", "XP, levels, coins, achievements, and celebration confetti.")}
              ${featureCard("Reminders", "In-app notification history + “smart nudges” for streak danger.")}
              ${featureCard("Community", "Share wins, like, comment, and stay accountable with friends.")}
            </div>
          </section>

          <section id="testimonials" class="section">
            <h3>Success stories</h3>
            <div class="cards">
              ${testimonial("Aanya", "“The streak + heatmap combo is addictive in the best way.”", "★★★★★")}
              ${testimonial("Michael", "“Looks premium and stays fast. I actually enjoy checking in.”", "★★★★★")}
              ${testimonial("Ravi", "“The weekly insights keep me honest without guilt.”", "★★★★★")}
            </div>
          </section>

          <section id="pricing" class="section">
            <h3>Simple pricing</h3>
            <div class="pricing">
              <div class="plan glass">
                <div class="pill">Free</div>
                <div class="price">$0</div>
                <div class="muted">Perfect to start building momentum.</div>
                <div class="list">
                  <span>✓ Habits & check-ins</span>
                  <span>✓ Streaks</span>
                  <span>✓ Basic analytics</span>
                </div>
                <a class="btn" href="auth.html">Create account</a>
              </div>
              <div class="plan glass" style="border-color: rgba(124,92,255,.35)">
                <div class="pill">Premium</div>
                <div class="price">$5<span style="font-size:16px; font-weight:700">/mo</span></div>
                <div class="muted">For serious consistency and deep insights.</div>
                <div class="list">
                  <span>✓ Advanced analytics & heatmaps</span>
                  <span>✓ Challenges & rewards</span>
                  <span>✓ Email-style reports (simulated)</span>
                </div>
                <a class="btn primary" href="auth.html">Start Premium</a>
              </div>
            </div>
          </section>

          <footer id="footer" class="footer">
            <div class="footerRow">
              <div>
                <div style="font-weight:900">HabitFlow</div>
                <div class="muted" style="margin-top:6px">Built to be fast, beautiful, and motivating.</div>
              </div>
              <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
                <a class="btn small" href="auth.html">Login</a>
                <a class="btn small" href="settings.html">Settings</a>
                <a class="btn small" href="#features">Features</a>
              </div>
            </div>
          </footer>
        </div>
      `;

      ui.qs("#landingThemeBtn").addEventListener("click", () => {
        store.update(st => ({
          ...st,
          settings: { ...st.settings, theme: (st.settings.theme === "dark" ? "light" : "dark") },
        }));
        initTheme();
      });

      // Smooth scrolling for anchor links
      document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener("click", (e) => {
          const id = a.getAttribute("href").slice(1);
          const el = document.getElementById(id);
          if (!el) return;
          e.preventDefault();
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    },

    auth() {
      initTheme();
      const root = ui.qs("#root");
      const s = store.read();
      const user = auth.currentUser(s);
      if (user) {
        location.href = "dashboard.html";
        return;
      }
      root.innerHTML = `
        <div class="authWrap">
          <div class="authLeft">
            <div class="glass" style="width:min(560px,100%); padding:18px; border-radius:26px;">
              <div class="pill">🔒 Secure sign-in • Local demo</div>
              <h1 style="margin:14px 0 8px; font-size:34px; letter-spacing:-.03em">Welcome to HabitFlow</h1>
              <p class="muted" style="margin:0; line-height:1.55">
                Sign up in seconds. Your data stays in your browser (no server needed).
              </p>
              <div class="section" style="padding-bottom:0">
                <div class="cards" style="grid-template-columns:1fr; gap:10px">
                  ${featureCard("Split-screen design", "Clean, premium layout for fast onboarding.")}
                  ${featureCard("Password strength", "Simple indicator + inline validation.")}
                  ${featureCard("Protected routes", "App pages require login." )}
                </div>
              </div>
              <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap">
                <a class="btn small" href="index.html">← Back</a>
                <button class="btn small" id="authThemeBtn">🌓 Theme</button>
              </div>
            </div>
          </div>
          <div class="authRight">
            <div class="panel glass">
              <div class="row">
                <div>
                  <div style="font-weight:900; font-size:16px">Login</div>
                  <div class="help">Use any email — this is a local demo.</div>
                </div>
                <button class="btn small" id="switchModeBtn">Sign up</button>
              </div>
              <div id="formRoot"></div>
            </div>
          </div>
        </div>
      `;
      ui.qs("#authThemeBtn").addEventListener("click", () => {
        store.update(st => ({
          ...st,
          settings: { ...st.settings, theme: (st.settings.theme === "dark" ? "light" : "dark") },
        }));
        initTheme();
      });

      let mode = "login";
      const render = () => {
        const formRoot = ui.qs("#formRoot");
        if (mode === "login") {
          formRoot.innerHTML = `
            <form id="loginForm">
              <div class="field">
                <label>Email</label>
                <input name="email" placeholder="you@example.com" autocomplete="email" />
              </div>
              <div class="field">
                <label>Password</label>
                <input name="password" type="password" placeholder="••••••••" autocomplete="current-password" />
              </div>
              <div class="row" style="margin-top:10px">
                <label class="help" style="display:flex; gap:8px; align-items:center">
                  <input type="checkbox" name="remember" checked />
                  Remember me
                </label>
                <button type="button" class="btn small" id="forgotBtn">Forgot password</button>
              </div>
              <div id="loginMsg" style="margin-top:10px"></div>
              <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap">
                <button class="btn primary" style="flex:1" type="submit">Login</button>
                <button class="btn" type="button" id="socialBtn">Continue with Social</button>
              </div>
              <div class="muted" style="margin-top:10px; font-size:12px; line-height:1.45">
                Social login is simulated (creates a new local account).
              </div>
            </form>
          `;
          ui.qs("#loginForm").addEventListener("submit", (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const res = auth.login({ email: fd.get("email"), password: fd.get("password") });
            ui.qs("#loginMsg").innerHTML = res.ok ? `<div class="ok">Login successful. Redirecting…</div>` : `<div class="error">${escapeHtml(res.error)}</div>`;
            if (res.ok) setTimeout(() => (location.href = "dashboard.html"), 500);
          });
          ui.qs("#forgotBtn").addEventListener("click", () => {
            ui.toast("Password reset", "This static demo can’t email you. Create a new account instead.");
          });
          ui.qs("#socialBtn").addEventListener("click", () => {
            const stamp = Date.now().toString().slice(-4);
            const res = auth.signup({ username: `SocialUser${stamp}`, email: `social${stamp}@demo.local`, password: "DemoPass123" });
            if (res.ok) location.href = "dashboard.html";
          });
        } else {
          formRoot.innerHTML = `
            <form id="signupForm">
              <div class="field">
                <label>Username</label>
                <input name="username" placeholder="Your name" autocomplete="nickname" />
              </div>
              <div class="field">
                <label>Email</label>
                <input name="email" placeholder="you@example.com" autocomplete="email" />
              </div>
              <div class="field">
                <label>Password</label>
                <input name="password" type="password" placeholder="At least 8 characters" autocomplete="new-password" />
                <div class="strength"><i id="strengthBar"></i></div>
                <div class="help" id="strengthText">Strength: weak</div>
              </div>
              <div class="field">
                <label>Confirm password</label>
                <input name="confirm" type="password" placeholder="Repeat password" autocomplete="new-password" />
              </div>
              <label class="help" style="display:flex; gap:8px; align-items:center; margin-top:10px">
                <input type="checkbox" name="terms" />
                I agree to the terms (demo)
              </label>
              <div id="signupMsg" style="margin-top:10px"></div>
              <button class="btn primary" style="width:100%; margin-top:12px" type="submit">Create account</button>
              <div class="muted" style="margin-top:10px; font-size:12px; line-height:1.45">
                Tip: after signup, we auto-add a few example habits to show dashboards & charts.
              </div>
            </form>
          `;
          const passwordEl = ui.qs('input[name="password"]');
          const bar = ui.qs("#strengthBar");
          const text = ui.qs("#strengthText");
          const calcStrength = (p) => {
            let score = 0;
            if (p.length >= 8) score++;
            if (/[A-Z]/.test(p)) score++;
            if (/[0-9]/.test(p)) score++;
            if (/[^A-Za-z0-9]/.test(p)) score++;
            return score;
          };
          const applyStrength = () => {
            const p = passwordEl.value || "";
            const score = calcStrength(p);
            const widths = [15, 35, 60, 85, 100];
            bar.style.width = widths[score] + "%";
            const labels = ["weak", "ok", "good", "strong", "very strong"];
            text.textContent = "Strength: " + labels[score];
          };
          passwordEl.addEventListener("input", applyStrength);
          applyStrength();
          ui.qs("#signupForm").addEventListener("submit", (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const username = fd.get("username");
            const email = fd.get("email");
            const password = fd.get("password");
            const confirm = fd.get("confirm");
            const terms = fd.get("terms");
            if (!terms) { ui.qs("#signupMsg").innerHTML = `<div class="error">Please accept the terms.</div>`; return; }
            if ((password || "") !== (confirm || "")) { ui.qs("#signupMsg").innerHTML = `<div class="error">Passwords do not match.</div>`; return; }
            const res = auth.signup({ username, email, password });
            ui.qs("#signupMsg").innerHTML = res.ok ? `<div class="ok">Account created. Redirecting…</div>` : `<div class="error">${escapeHtml(res.error)}</div>`;
            if (res.ok) setTimeout(() => (location.href = "dashboard.html"), 600);
          });
        }
      };
      ui.qs("#switchModeBtn").addEventListener("click", () => {
        mode = mode === "login" ? "signup" : "login";
        ui.qs("#switchModeBtn").textContent = mode === "login" ? "Sign up" : "Login";
        ui.qs(".authRight .row > div > div").textContent = mode === "login" ? "Login" : "Sign up";
        render();
      });
      render();
    },

    dashboard() {
      const user = auth.requireLogin();
      if (!user) return;
      injectAppShell("dashboard.html", "Dashboard");
      const root = ui.qs("#pageRoot");
      const s = store.read();
      const list = habits.listForUser(s, user.id);
      const completedToday = habits.completedOnDate(s, user.id, nowIsoDate());
      const weekly = habits.weeklyStats(s, user.id);
      const successRate = list.length ? completedToday.size / list.length : 0;
      const bestStreak = list.reduce((acc, h) => Math.max(acc, habits.streakForHabit(s, user.id, h.id).longest), 0);
      const currentStreak = list.reduce((acc, h) => Math.max(acc, habits.streakForHabit(s, user.id, h.id).current), 0);
      const quote = pickQuote();

      root.innerHTML = `
        <div class="grid four">
          ${kpiCard("Total habits", list.length, "Active routines")}
          ${kpiCard("Completed today", completedToday.size, "Tap a habit to check in")}
          ${kpiCard("Success rate", Math.round(successRate * 100) + "%", "Today’s completion ratio")}
          ${kpiCard("Weekly consistency", Math.round(weekly.rate * 100) + "%", "Last 7 days")}
        </div>

        <div class="grid two" style="margin-top:16px">
          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Streaks</h3>
              <span class="badge">Keep it alive</span>
            </div>
            <div class="grid two">
              <div class="glass" style="padding:14px; border-radius:16px">
                <div class="muted" style="font-size:12px">Current streak (best habit)</div>
                <div class="kpi">${currentStreak} days</div>
              </div>
              <div class="glass" style="padding:14px; border-radius:16px">
                <div class="muted" style="font-size:12px">Longest streak</div>
                <div class="kpi">${bestStreak} days</div>
              </div>
            </div>
            <div class="divider"></div>
            <div class="muted" style="line-height:1.45">${escapeHtml(quote)}</div>
          </div>

          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Productivity score</h3>
              <span class="badge">Today</span>
            </div>
            <div class="canvasWrap glass">
              <canvas id="scoreChart" height="260"></canvas>
            </div>
            <div class="row" style="margin-top:10px">
              <div class="muted">Goal completion</div>
              <div style="font-weight:900">${Math.round(successRate * 100)}%</div>
            </div>
          </div>
        </div>

        <div class="grid two" style="margin-top:16px">
          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Today’s habits</h3>
              <div style="display:flex; gap:10px">
                <a class="btn small" href="habits.html">Manage</a>
              </div>
            </div>
            <div id="todayList" class="habitsList"></div>
          </div>
          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Calendar (this month)</h3>
              <a class="btn small" href="calendar.html">Open</a>
            </div>
            <div id="miniCalendar" class="cal"></div>
          </div>
        </div>
      `;

      renderTodayList();
      drawRing("scoreChart", clamp(successRate, 0, 1), successRate >= 0.8 ? "#2EE59D" : "#7C5CFF");
      renderMiniCalendar();

      document.addEventListener("ht:search", (e) => {
        const q = (e.detail?.q || "").toLowerCase();
        renderTodayList(q);
      });

      function renderTodayList(q = "") {
        const state = store.read();
        const items = habits.listForUser(state, user.id).filter(h => (h.title || "").toLowerCase().includes(q));
        const doneSet = habits.completedOnDate(state, user.id, nowIsoDate());
        const listRoot = ui.qs("#todayList");
        listRoot.innerHTML = items.length ? items.map(h => habitRow(h, doneSet.has(h.id))).join("") : `<div class="muted">No habits match.</div>`;
        ui.qsa("[data-toggle]", listRoot).forEach(btn => {
          btn.addEventListener("click", () => {
            habits.toggleComplete(user.id, btn.getAttribute("data-toggle"), nowIsoDate());
            renderTodayList(q);
            const s2 = store.read();
            const done = habits.completedOnDate(s2, user.id, nowIsoDate()).size;
            const total = habits.listForUser(s2, user.id).length;
            const r = total ? done / total : 0;
            drawRing("scoreChart", clamp(r, 0, 1), r >= 0.8 ? "#2EE59D" : "#7C5CFF");
          });
        });
      }

      function renderMiniCalendar() {
        const state = store.read();
        const today = new Date();
        const heat = habits.monthHeatmap(state, user.id, today.getFullYear(), today.getMonth());
        const firstDow = new Date(today.getFullYear(), today.getMonth(), 1).getDay(); // 0..6
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const root = ui.qs("#miniCalendar");
        const cells = [];
        for (let i = 0; i < firstDow; i++) cells.push(`<div class="day" style="opacity:.35"></div>`);
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(today.getFullYear(), today.getMonth(), d);
          const iso = date.toISOString().slice(0, 10);
          const count = heat.byDate.get(iso) || 0;
          const totalHabits = habits.listForUser(state, user.id).length || 1;
          const ratio = count / totalHabits;
          const cls = iso === nowIsoDate()
            ? "day today"
            : ratio >= 0.75 ? "day good" : (ratio > 0 ? "day" : "day bad");
          cells.push(`<div class="${cls}"><div class="d">${d}</div></div>`);
        }
        root.innerHTML = cells.join("");
      }
    },

    habits() {
      const user = auth.requireLogin();
      if (!user) return;
      injectAppShell("habits.html", "Habit Management");
      const root = ui.qs("#pageRoot");
      root.innerHTML = `
        <div class="grid two">
          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Create / Edit habit</h3>
              <span class="badge">Drag to reorder</span>
            </div>
            <form id="habitForm">
              <input type="hidden" name="id" />
              <div class="field">
                <label>Habit title</label>
                <input name="title" placeholder="e.g., Drink water" required />
              </div>
              <div class="field">
                <label>Description</label>
                <textarea name="description" rows="3" placeholder="Why this matters..."></textarea>
              </div>
              <div class="grid two" style="margin-top:12px">
                <div class="field" style="margin-top:0">
                  <label>Category</label>
                  <select name="category">
                    ${["Fitness","Study","Meditation","Reading","Water intake","Sleep","Mindfulness","Learning","Health","General"].map(c => `<option>${escapeHtml(c)}</option>`).join("")}
                  </select>
                </div>
                <div class="field" style="margin-top:0">
                  <label>Frequency</label>
                  <select name="frequency">
                    ${["Daily","Weekdays","Custom (demo)"].map(f => `<option>${escapeHtml(f)}</option>`).join("")}
                  </select>
                </div>
              </div>
              <div class="grid two" style="margin-top:12px">
                <div class="field" style="margin-top:0">
                  <label>Difficulty</label>
                  <select name="difficulty">
                    ${["Easy","Medium","Hard"].map(d => `<option>${escapeHtml(d)}</option>`).join("")}
                  </select>
                </div>
                <div class="field" style="margin-top:0">
                  <label>Reminder time</label>
                  <input name="reminderTime" type="time" value="20:30" />
                </div>
              </div>
              <div class="grid two" style="margin-top:12px">
                <div class="field" style="margin-top:0">
                  <label>Icon (1 character)</label>
                  <input name="icon" maxlength="2" placeholder="✓" />
                </div>
                <div class="field" style="margin-top:0">
                  <label>Color</label>
                  <input name="color" type="color" value="#7c5cff" />
                </div>
              </div>
              <div class="grid two" style="margin-top:12px">
                <div class="field" style="margin-top:0">
                  <label>Priority</label>
                  <input name="priority" type="number" min="1" max="10" value="5" />
                </div>
                <div class="field" style="margin-top:0">
                  <label>Notes</label>
                  <input name="notes" placeholder="Optional notes..." />
                </div>
              </div>
              <div class="row" style="margin-top:14px">
                <button class="btn primary" type="submit" style="flex:1">Save habit</button>
                <button class="btn" type="button" id="resetHabitBtn">Reset</button>
              </div>
              <div class="muted" style="margin-top:10px; font-size:12px; line-height:1.45">
                Tip: after saving, use “Check in” to mark today as complete.
              </div>
            </form>
          </div>

          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Your habits</h3>
              <div style="display:flex; gap:10px; align-items:center">
                <span class="badge" id="habitsCount">0</span>
              </div>
            </div>
            <div class="row" style="margin-bottom:10px">
              <div class="search" style="min-width:0; flex:1">
                <span class="muted">⌕</span>
                <input id="habitSearch" placeholder="Search habits..." />
              </div>
              <select id="catFilter" class="btn small" style="padding:10px 12px">
                <option value="">All</option>
                ${["Fitness","Study","Meditation","Reading","Water intake","Sleep","Mindfulness","Learning","Health","General"].map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
              </select>
            </div>
            <div id="habitsList" class="habitsList"></div>
          </div>
        </div>
      `;

      const form = ui.qs("#habitForm");
      const listRoot = ui.qs("#habitsList");
      const searchEl = ui.qs("#habitSearch");
      const filterEl = ui.qs("#catFilter");

      ui.qs("#resetHabitBtn").addEventListener("click", () => {
        form.reset();
        form.elements.id.value = "";
        form.elements.color.value = "#7c5cff";
      });

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const id = (fd.get("id") || "").toString();
        const title = (fd.get("title") || "").toString().trim();
        if (title.length < 2) { ui.toast("Validation", "Habit title must be at least 2 characters."); return; }
        const payload = {
          title,
          description: (fd.get("description") || "").toString().trim(),
          category: (fd.get("category") || "General").toString(),
          frequency: (fd.get("frequency") || "Daily").toString(),
          difficulty: (fd.get("difficulty") || "Easy").toString(),
          reminderTime: (fd.get("reminderTime") || "").toString(),
          icon: ((fd.get("icon") || "✓").toString().trim().slice(0, 2) || "✓"),
          color: (fd.get("color") || "#7c5cff").toString(),
          notes: (fd.get("notes") || "").toString().trim(),
          priority: clamp(parseInt((fd.get("priority") || "5").toString(), 10) || 5, 1, 10),
        };
        store.update(s => {
          const next = { ...s };
          if (id) {
            next.habits = next.habits.map(h => (h.id === id && h.userId === user.id ? { ...h, ...payload } : h));
          } else {
            const order = (habits.listForUser(s, user.id).slice(-1)[0]?.order || 0) + 1;
            next.habits = [
              ...next.habits,
              { id: uid(), userId: user.id, archived: false, order, createdAt: new Date().toISOString(), ...payload },
            ];
          }
          return next;
        });
        ui.toast("Saved", "Habit saved successfully.");
        form.reset();
        form.elements.id.value = "";
        render();
      });

      function render() {
        const s = store.read();
        const q = (searchEl.value || "").trim().toLowerCase();
        const cat = filterEl.value || "";
        const list = habits.listForUser(s, user.id).filter(h => {
          const okQ = !q || (h.title || "").toLowerCase().includes(q) || (h.description || "").toLowerCase().includes(q);
          const okCat = !cat || h.category === cat;
          return okQ && okCat;
        });
        ui.qs("#habitsCount").textContent = `${habits.listForUser(s, user.id).length}`;
        const doneSet = habits.completedOnDate(s, user.id, nowIsoDate());
        listRoot.innerHTML = list.length ? list.map(h => `
          <div class="habitItem" draggable="true" data-drag="${escapeHtml(h.id)}">
            <div class="habitMeta">
              <span class="habitDot" style="background:${escapeHtml(h.color || "#7C5CFF")}"></span>
              <div style="min-width:0">
                <div class="name">${escapeHtml(h.icon || "✓")} ${escapeHtml(h.title || "Untitled")}</div>
                <div class="mini">${escapeHtml(h.category)} • ${escapeHtml(h.frequency)} • Priority ${escapeHtml(h.priority || 5)}</div>
              </div>
            </div>
            <div class="habitActions">
              <button class="btn small ${doneSet.has(h.id) ? "primary" : ""}" data-toggle="${escapeHtml(h.id)}">${doneSet.has(h.id) ? "Done" : "Check in"}</button>
              <button class="btn small" data-edit="${escapeHtml(h.id)}">Edit</button>
              <button class="btn small danger" data-archive="${escapeHtml(h.id)}">Archive</button>
            </div>
          </div>
        `).join("") : `<div class="muted">No habits yet. Create one on the left.</div>`;

        ui.qsa("[data-toggle]", listRoot).forEach(btn => btn.addEventListener("click", () => {
          habits.toggleComplete(user.id, btn.getAttribute("data-toggle"), nowIsoDate());
          if (!doneSet.has(btn.getAttribute("data-toggle"))) ui.confetti();
          render();
        }));
        ui.qsa("[data-edit]", listRoot).forEach(btn => btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-edit");
          const h = s.habits.find(x => x.id === id && x.userId === user.id);
          if (!h) return;
          form.elements.id.value = h.id;
          form.elements.title.value = h.title || "";
          form.elements.description.value = h.description || "";
          form.elements.category.value = h.category || "General";
          form.elements.frequency.value = h.frequency || "Daily";
          form.elements.difficulty.value = h.difficulty || "Easy";
          form.elements.reminderTime.value = h.reminderTime || "20:30";
          form.elements.icon.value = h.icon || "✓";
          form.elements.color.value = h.color || "#7c5cff";
          form.elements.notes.value = h.notes || "";
          form.elements.priority.value = h.priority || 5;
          ui.toast("Edit mode", "Update the form and hit Save.");
        }));
        ui.qsa("[data-archive]", listRoot).forEach(btn => btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-archive");
          store.update(st => ({ ...st, habits: st.habits.map(h => (h.id === id && h.userId === user.id ? { ...h, archived: true } : h)) }));
          ui.toast("Archived", "Habit archived. You can re-add it anytime.");
          render();
        }));

        enableDragReorder(listRoot, user.id);
      }

      searchEl.addEventListener("input", render);
      filterEl.addEventListener("change", render);
      document.addEventListener("ht:search", (e) => { searchEl.value = e.detail?.q || ""; render(); });
      render();
    },

    analytics() {
      const user = auth.requireLogin();
      if (!user) return;
      injectAppShell("analytics.html", "Analytics");
      const root = ui.qs("#pageRoot");
      root.innerHTML = `
        <div class="grid two">
          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Weekly progress</h3>
              <span class="badge">Last 7 days</span>
            </div>
            <div class="canvasWrap glass">
              <canvas id="weeklyBar" height="260"></canvas>
            </div>
            <div class="row" style="margin-top:10px">
              <div class="muted" id="weeklySummary">—</div>
              <a class="btn small" href="habits.html">Improve</a>
            </div>
          </div>

          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Monthly trend</h3>
              <span class="badge">Last 30 days</span>
            </div>
            <div class="canvasWrap glass">
              <canvas id="monthlyLine" height="260"></canvas>
            </div>
            <div class="muted" style="margin-top:10px; line-height:1.45" id="monthlyInsight">—</div>
          </div>
        </div>

        <div class="grid two" style="margin-top:16px">
          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Category analysis</h3>
              <span class="badge">Pie</span>
            </div>
            <div class="canvasWrap glass">
              <canvas id="categoryPie" height="260"></canvas>
            </div>
            <div class="muted" style="margin-top:10px; line-height:1.45" id="categoryInsight">—</div>
          </div>

          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Productivity heatmap</h3>
              <span class="badge">This month</span>
            </div>
            <div id="heatmap" class="cal"></div>
            <div class="muted" style="margin-top:10px; line-height:1.45" id="smartInsight">—</div>
          </div>
        </div>
      `;
      render();

      function render() {
        const s = store.read();
        const list = habits.listForUser(s, user.id);
        const weekly = habits.weeklyStats(s, user.id);
        drawBar("weeklyBar", weekly.perDay.map(p => p.completed), {
          labels: weekly.perDay.map(p => p.date.slice(5)),
          accent: "#7C5CFF",
        });
        ui.qs("#weeklySummary").textContent = list.length
          ? `Done ${weekly.done} of ${weekly.totalPossible} check-ins (${Math.round(weekly.rate * 100)}%).`
          : "Create habits to unlock analytics.";

        const trend = computeLast30Trend(s, user.id, list.length || 1);
        drawLine("monthlyLine", trend.values, { accent: "#2EE59D" });
        ui.qs("#monthlyInsight").textContent = trend.insight;

        const cat = categoryBreakdown(s, user.id);
        drawPie("categoryPie", cat.values, { colors: cat.colors });
        ui.qs("#categoryInsight").textContent = cat.insight;

        renderHeatmap(s);
        ui.qs("#smartInsight").textContent = smartInsights(s, user.id);
      }

      function computeLast30Trend(state, userId, habitsCount) {
        const today = new Date();
        const values = [];
        let bestDay = { iso: "", rate: 0 };
        for (let i = 29; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const iso = d.toISOString().slice(0, 10);
          const completed = state.completions.filter(c => c.userId === userId && c.date === iso).length;
          const rate = completed / habitsCount;
          values.push(rate);
          if (rate > bestDay.rate) bestDay = { iso, rate };
        }
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        return {
          values,
          insight: habitsCount
            ? `Best day: ${ui.fmtDate(bestDay.iso)} (${Math.round(bestDay.rate * 100)}%). 30‑day average: ${Math.round(avg * 100)}%.`
            : "No habits yet. Create some to see trends.",
        };
      }

      function categoryBreakdown(state, userId) {
        const list = habits.listForUser(state, userId);
        const colors = {};
        const map = new Map();
        for (const h of list) {
          const k = h.category || "General";
          map.set(k, (map.get(k) || 0) + 1);
          colors[k] ||= h.color || "#7C5CFF";
        }
        const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
        const values = entries.map(([, v]) => v);
        const colorList = entries.map(([k]) => colors[k]);
        const top = entries[0];
        return {
          values,
          colors: colorList.length ? colorList : ["#7C5CFF"],
          insight: top ? `Top category: ${top[0]} (${top[1]} habits).` : "Add habits to see category distribution.",
        };
      }

      function renderHeatmap(state) {
        const today = new Date();
        const heat = habits.monthHeatmap(state, user.id, today.getFullYear(), today.getMonth());
        const firstDow = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const root = ui.qs("#heatmap");
        const totalHabits = habits.listForUser(state, user.id).length || 1;
        const cells = [];
        for (let i = 0; i < firstDow; i++) cells.push(`<div class="day" style="opacity:.35"></div>`);
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(today.getFullYear(), today.getMonth(), d);
          const iso = date.toISOString().slice(0, 10);
          const count = heat.byDate.get(iso) || 0;
          const ratio = count / totalHabits;
          const cls = iso === nowIsoDate()
            ? "day today"
            : ratio >= 0.75 ? "day good" : (ratio > 0 ? "day" : "day bad");
          cells.push(`<div class="${cls}" title="${escapeHtml(iso)} • ${count} done"><div class="d">${d}</div></div>`);
        }
        root.innerHTML = cells.join("");
      }
    },

    calendar() {
      const user = auth.requireLogin();
      if (!user) return;
      injectAppShell("calendar.html", "Calendar & Timeline");
      const root = ui.qs("#pageRoot");
      root.innerHTML = `
        <div class="grid two">
          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Interactive calendar</h3>
              <div style="display:flex; gap:10px; align-items:center">
                <button class="btn small" id="prevMonthBtn">←</button>
                <span class="badge" id="monthLabel">—</span>
                <button class="btn small" id="nextMonthBtn">→</button>
              </div>
            </div>
            <div id="calGrid" class="cal"></div>
            <div class="muted" style="margin-top:10px; line-height:1.45" id="calHint">Click a day to see logs.</div>
          </div>

          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Timeline</h3>
              <span class="badge">Recent check-ins</span>
            </div>
            <div id="timeline" class="grid" style="gap:10px"></div>
            <div class="row" style="margin-top:10px">
              <div class="muted" id="timelineMeta">—</div>
              <button class="btn small" id="logTodayBtn">Log today</button>
            </div>
          </div>
        </div>
      `;

      let cursor = new Date();
      cursor.setDate(1);
      render();

      ui.qs("#prevMonthBtn").addEventListener("click", () => { cursor.setMonth(cursor.getMonth() - 1); render(); });
      ui.qs("#nextMonthBtn").addEventListener("click", () => { cursor.setMonth(cursor.getMonth() + 1); render(); });
      ui.qs("#logTodayBtn").addEventListener("click", () => {
        location.href = "dashboard.html";
      });

      function render() {
        const state = store.read();
        const y = cursor.getFullYear();
        const m = cursor.getMonth();
        const monthName = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        ui.qs("#monthLabel").textContent = monthName;
        renderCalendar(state, y, m);
        renderTimeline(state);
      }

      function renderCalendar(state, year, monthIndex) {
        const firstDow = new Date(year, monthIndex, 1).getDay();
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        const root = ui.qs("#calGrid");
        const totalHabits = habits.listForUser(state, user.id).length || 1;
        const heat = habits.monthHeatmap(state, user.id, year, monthIndex);
        const cells = [];
        for (let i = 0; i < firstDow; i++) cells.push(`<div class="day" style="opacity:.35"></div>`);
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(year, monthIndex, d);
          const iso = date.toISOString().slice(0, 10);
          const count = heat.byDate.get(iso) || 0;
          const ratio = count / totalHabits;
          const cls = iso === nowIsoDate()
            ? "day today"
            : ratio >= 0.75 ? "day good" : (ratio > 0 ? "day" : "day bad");
          cells.push(`<button class="${cls}" data-day="${escapeHtml(iso)}" style="text-align:left; cursor:pointer">
            <div class="d">${d}</div>
            <div class="muted" style="font-size:12px; margin-top:8px">${count} done</div>
          </button>`);
        }
        root.innerHTML = cells.join("");
        ui.qsa("[data-day]", root).forEach(btn => btn.addEventListener("click", () => {
          const iso = btn.getAttribute("data-day");
          renderTimeline(store.read(), iso);
        }));
      }

      function renderTimeline(state, filterIso = "") {
        const list = habits.listForUser(state, user.id);
        const habitById = new Map(list.map(h => [h.id, h]));
        const logs = state.completions
          .filter(c => c.userId === user.id)
          .filter(c => !filterIso || c.date === filterIso)
          .slice()
          .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
        const root = ui.qs("#timeline");
        ui.qs("#timelineMeta").textContent = filterIso ? `Showing ${ui.fmtDate(filterIso)} (${logs.length} check-ins).` : `Showing recent activity (${logs.slice(0, 18).length} items).`;
        const show = (filterIso ? logs : logs.slice(0, 18));
        root.innerHTML = show.length ? show.map(c => {
          const h = habitById.get(c.habitId);
          return `
            <div class="glass" style="padding:12px; border-radius:16px">
              <div class="row">
                <div style="font-weight:900">${escapeHtml(h?.title || "Habit")}</div>
                <div class="muted" style="font-size:12px">${ui.fmtDate(c.at || c.date)}</div>
              </div>
              <div class="muted" style="margin-top:6px">${escapeHtml(h?.category || "General")} • ${escapeHtml(h?.difficulty || "Easy")}</div>
            </div>
          `;
        }).join("") : `<div class="muted">No check-ins yet. Start from Dashboard.</div>`;
      }
    },

    rewards() {
      const user = auth.requireLogin();
      if (!user) return;
      injectAppShell("rewards.html", "Gamification & Rewards");
      const root = ui.qs("#pageRoot");
      const s = store.read();
      gamification.ensureUser(user.id);
      const g = store.read().gamification;
      const level = g.levelByUser[user.id] || 1;
      const xp = g.xpByUser[user.id] || 0;
      const nextXp = gamification.xpToNext(level);
      const coins = g.coinsByUser[user.id] || 0;
      const ach = g.achievementsByUser[user.id] || [];

      root.innerHTML = `
        <div class="grid three">
          ${kpiCard("Level", level, `Next level: ${nextXp - xp} XP`)}
          ${kpiCard("Coins", coins, "Earn coins by consistency")}
          ${kpiCard("Achievements", ach.length, "Badges unlocked")}
        </div>
        <div class="grid two" style="margin-top:16px">
          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Achievements</h3>
              <span class="badge">Badges</span>
            </div>
            <div id="achList" class="grid two"></div>
            <div class="muted" style="margin-top:10px; line-height:1.45">Complete habits daily to unlock more.</div>
          </div>
          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Leaderboard (local)</h3>
              <span class="badge">Demo</span>
            </div>
            <div id="leaderboard" class="grid" style="gap:10px"></div>
            <div class="row" style="margin-top:10px">
              <button class="btn small" id="weeklyChallengeBtn">Start weekly challenge</button>
              <span class="muted" style="font-size:12px">XP boost</span>
            </div>
          </div>
        </div>
      `;

      const allBadges = [
        { key: "streak_7", title: "7‑Day Streak", desc: "Maintain a 7-day streak on any habit." },
        { key: "streak_30", title: "30‑Day Legend", desc: "Maintain a 30-day streak on any habit." },
        { key: "habits_5", title: "Habit Builder", desc: "Create 5 active habits." },
        { key: "week_elite", title: "Weekly Elite", desc: "85%+ weekly consistency." },
        { key: "early_riser", title: "Early Riser", desc: "Complete a habit before 7am (demo)." },
        { key: "pomodoro_1", title: "Focus Starter", desc: "Finish a Pomodoro session (demo)." },
      ];
      const achRoot = ui.qs("#achList");
      achRoot.innerHTML = allBadges.map(b => `
        <div class="glass" style="padding:14px; border-radius:16px; ${ach.includes(b.key) ? "border-color: rgba(46,229,157,.35)" : ""}">
          <div class="row">
            <div style="font-weight:900">${escapeHtml(b.title)}</div>
            <span class="badge">${ach.includes(b.key) ? "Unlocked" : "Locked"}</span>
          </div>
          <div class="muted" style="margin-top:8px; font-size:13px; line-height:1.45">${escapeHtml(b.desc)}</div>
        </div>
      `).join("");

      renderLeaderboard();
      ui.qs("#weeklyChallengeBtn").addEventListener("click", () => {
        gamification.addXP(user.id, 25, "Weekly challenge started");
        notifications.add(user.id, { type: "Challenge", message: "Weekly challenge: hit 80% consistency for a bonus badge." });
        ui.confetti();
        renderLeaderboard();
      });

      function renderLeaderboard() {
        const state = store.read();
        const users = state.users.slice();
        const g2 = state.gamification;
        const rows = users
          .map(u => ({
            username: u.username,
            level: g2.levelByUser[u.id] || 1,
            xp: g2.xpByUser[u.id] || 0,
            coins: g2.coinsByUser[u.id] || 0,
          }))
          .sort((a, b) => (b.level - a.level) || (b.xp - a.xp) || (b.coins - a.coins))
          .slice(0, 10);
        ui.qs("#leaderboard").innerHTML = rows.map((r, i) => `
          <div class="glass" style="padding:12px; border-radius:16px">
            <div class="row">
              <div style="font-weight:900">#${i + 1} ${escapeHtml(r.username)}</div>
              <div class="muted" style="font-size:12px">Lv ${r.level}</div>
            </div>
            <div class="muted" style="margin-top:6px">XP: ${r.xp} • Coins: ${r.coins}</div>
          </div>
        `).join("");
      }
    },

    reminders() {
      const user = auth.requireLogin();
      if (!user) return;
      injectAppShell("reminders.html", "Reminders & Notifications");
      const root = ui.qs("#pageRoot");
      root.innerHTML = `
        <div class="grid two">
          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Reminder settings</h3>
              <span class="badge">In-app</span>
            </div>
            <form id="remForm">
              <div class="field">
                <label>Reminder type</label>
                <select name="type">
                  <option>Daily reminder</option>
                  <option>Weekly reminder</option>
                  <option>Streak danger warning</option>
                  <option>Motivation nudge</option>
                  <option>Email report (simulated)</option>
                </select>
              </div>
              <div class="field">
                <label>Message</label>
                <input name="message" placeholder="e.g., Check in to protect your streak." />
              </div>
              <div class="field">
                <label>Schedule (text)</label>
                <input name="scheduledAt" placeholder="e.g., 20:30 daily" />
              </div>
              <button class="btn primary" style="width:100%; margin-top:12px" type="submit">Create reminder</button>
            </form>
            <div class="divider"></div>
            <div class="row">
              <button class="btn small" id="smartNudgeBtn">Run smart nudge</button>
              <span class="muted" style="font-size:12px">AI-style logic (local)</span>
            </div>
          </div>
          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Notification history</h3>
              <span class="badge">Latest first</span>
            </div>
            <div id="notifHistory" class="grid" style="gap:10px"></div>
          </div>
        </div>
      `;
      ui.qs("#remForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        notifications.add(user.id, {
          type: fd.get("type"),
          message: fd.get("message") || "Reminder created.",
          scheduledAt: fd.get("scheduledAt") || "",
        });
        ui.toast("Created", "Reminder added to notification history.");
        e.target.reset();
        render();
      });
      ui.qs("#smartNudgeBtn").addEventListener("click", () => {
        const s = store.read();
        const list = habits.listForUser(s, user.id);
        const done = habits.completedOnDate(s, user.id, nowIsoDate()).size;
        const total = list.length || 1;
        const rate = done / total;
        if (rate < 0.4) {
          notifications.add(user.id, { type: "Streak danger", message: "Small win time: complete just ONE habit to keep momentum today.", scheduledAt: "now" });
        } else if (rate < 0.9) {
          notifications.add(user.id, { type: "Motivation", message: "You’re close. Finish the last few habits for a clean day.", scheduledAt: "now" });
        } else {
          notifications.add(user.id, { type: "Celebration", message: "Perfect day. Lock it in and recover well tomorrow.", scheduledAt: "now" });
        }
        ui.confetti();
        render();
      });
      render();

      function render() {
        const s = store.read();
        const list = s.notifications.filter(n => n.userId === user.id).slice(0, 30);
        ui.qs("#notifHistory").innerHTML = list.length ? list.map(n => `
          <div class="glass" style="padding:12px; border-radius:16px">
            <div class="row">
              <div style="font-weight:900">${escapeHtml(n.type || "Info")}${n.read ? "" : " •"}</div>
              <div class="muted" style="font-size:12px">${ui.fmtDate(n.createdAt)}</div>
            </div>
            <div class="muted" style="margin-top:6px; line-height:1.45">${escapeHtml(n.message)}</div>
            ${n.scheduledAt ? `<div class="muted" style="margin-top:6px; font-size:12px">Schedule: ${escapeHtml(n.scheduledAt)}</div>` : ""}
          </div>
        `).join("") : `<div class="muted">No notifications yet.</div>`;
      }
    },

    community() {
      const user = auth.requireLogin();
      if (!user) return;
      injectAppShell("community.html", "Community");
      const root = ui.qs("#pageRoot");
      root.innerHTML = `
        <div class="grid two">
          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Create post</h3>
              <span class="badge">Share wins</span>
            </div>
            <form id="postForm">
              <div class="field">
                <label>What did you accomplish?</label>
                <textarea name="body" rows="4" placeholder="e.g., 7-day streak! Feeling unstoppable."></textarea>
              </div>
              <button class="btn primary" style="width:100%; margin-top:12px" type="submit">Post</button>
            </form>
            <div class="divider"></div>
            <div class="row">
              <button class="btn small" id="shareStreakBtn">Share my streak</button>
              <span class="muted" style="font-size:12px">Auto post</span>
            </div>
          </div>
          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Feed</h3>
              <span class="badge">Local demo</span>
            </div>
            <div id="feed" class="grid" style="gap:10px"></div>
          </div>
        </div>
      `;

      ui.qs("#postForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const body = (fd.get("body") || "").toString().trim();
        if (body.length < 2) { ui.toast("Too short", "Write at least 2 characters."); return; }
        createPost(body);
        e.target.reset();
        render();
      });

      ui.qs("#shareStreakBtn").addEventListener("click", () => {
        const s = store.read();
        const list = habits.listForUser(s, user.id);
        const best = list.reduce((acc, h) => Math.max(acc, habits.streakForHabit(s, user.id, h.id).current), 0);
        createPost(`Streak check: I’m on a ${best}-day streak. Next stop: consistency mastery.`);
        ui.confetti();
        render();
      });

      function createPost(body) {
        store.update(s => ({
          ...s,
          posts: [{ id: uid(), userId: user.id, body, createdAt: new Date().toISOString(), likes: [], comments: [] }, ...s.posts],
        }));
        gamification.addXP(user.id, 8, "Community post");
      }

      function render() {
        const s = store.read();
        const userById = new Map(s.users.map(u => [u.id, u]));
        const posts = s.posts.slice(0, 25);
        const root = ui.qs("#feed");
        root.innerHTML = posts.length ? posts.map(p => {
          const author = userById.get(p.userId);
          const liked = (p.likes || []).includes(user.id);
          return `
            <div class="glass" style="padding:12px; border-radius:16px">
              <div class="row">
                <div style="font-weight:900">${escapeHtml(author?.username || "User")}</div>
                <div class="muted" style="font-size:12px">${ui.fmtDate(p.createdAt)}</div>
              </div>
              <div style="margin-top:8px; line-height:1.55">${escapeHtml(p.body)}</div>
              <div class="row" style="margin-top:10px">
                <div class="muted" style="font-size:12px">${(p.likes || []).length} likes • ${(p.comments || []).length} comments</div>
                <div style="display:flex; gap:10px">
                  <button class="btn small ${liked ? "primary" : ""}" data-like="${escapeHtml(p.id)}">${liked ? "Liked" : "Like"}</button>
                  <button class="btn small" data-comment="${escapeHtml(p.id)}">Comment</button>
                </div>
              </div>
              <div id="c_${escapeHtml(p.id)}" class="grid" style="gap:8px; margin-top:10px"></div>
            </div>
          `;
        }).join("") : `<div class="muted">No posts yet. Share your first win.</div>`;

        ui.qsa("[data-like]", root).forEach(btn => btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-like");
          store.update(st => {
            const posts2 = st.posts.map(p => {
              if (p.id !== id) return p;
              const likes = new Set(p.likes || []);
              if (likes.has(user.id)) likes.delete(user.id); else likes.add(user.id);
              return { ...p, likes: Array.from(likes) };
            });
            return { ...st, posts: posts2 };
          });
          render();
        }));
        ui.qsa("[data-comment]", root).forEach(btn => btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-comment");
          const text = prompt("Comment (local demo):");
          if (!text) return;
          store.update(st => {
            const posts2 = st.posts.map(p => {
              if (p.id !== id) return p;
              const comments = [...(p.comments || []), { id: uid(), userId: user.id, body: text.slice(0, 200), createdAt: new Date().toISOString() }];
              return { ...p, comments };
            });
            return { ...st, posts: posts2 };
          });
          gamification.addXP(user.id, 4, "Comment");
          render();
        }));

        // Render comments
        for (const p of posts) {
          const slot = ui.qs(`#c_${p.id}`);
          if (!slot) continue;
          const comments = (p.comments || []).slice(-3);
          slot.innerHTML = comments.map(c => {
            const author = userById.get(c.userId);
            return `<div class="glass" style="padding:10px; border-radius:14px">
              <div class="row">
                <div style="font-weight:900; font-size:13px">${escapeHtml(author?.username || "User")}</div>
                <div class="muted" style="font-size:12px">${ui.fmtDate(c.createdAt)}</div>
              </div>
              <div class="muted" style="margin-top:6px; line-height:1.45">${escapeHtml(c.body)}</div>
            </div>`;
          }).join("");
        }
      }
      render();
    },

    settings() {
      const user = auth.requireLogin();
      if (!user) return;
      injectAppShell("settings.html", "Settings & Profile");
      const root = ui.qs("#pageRoot");
      const s = store.read();
      const settings = s.settings || { theme: "dark", sound: true, focusMode: false, timezone: "Local" };
      root.innerHTML = `
        <div class="grid two">
          <div class="widget glass">
            <div class="widgetHeader">
              <h3>User profile</h3>
              <span class="badge">Personalize</span>
            </div>
            <form id="profileForm">
              <div class="field">
                <label>Name</label>
                <input name="username" value="${escapeHtml(user.username || "")}" />
              </div>
              <div class="field">
                <label>Avatar (emoji)</label>
                <input name="avatar" value="${escapeHtml(user.avatar || "")}" placeholder="😀" />
              </div>
              <div class="field">
                <label>Bio</label>
                <textarea name="bio" rows="3" placeholder="What are you building?">${escapeHtml(user.bio || "")}</textarea>
              </div>
              <div class="field">
                <label>Goals</label>
                <input name="goals" value="${escapeHtml(user.goals || "")}" />
              </div>
              <button class="btn primary" style="width:100%; margin-top:12px" type="submit">Save profile</button>
            </form>
          </div>

          <div class="widget glass">
            <div class="widgetHeader">
              <h3>App settings</h3>
              <span class="badge">Theme • Sound</span>
            </div>
            <div class="grid two">
              <div class="glass" style="padding:14px; border-radius:16px">
                <div style="font-weight:900">Theme</div>
                <div class="muted" style="margin-top:6px">Current: ${escapeHtml(settings.theme)}</div>
                <button class="btn small" id="themeBtn" style="margin-top:10px">Toggle theme</button>
              </div>
              <div class="glass" style="padding:14px; border-radius:16px">
                <div style="font-weight:900">Sound effects</div>
                <div class="muted" style="margin-top:6px">Toggle (demo)</div>
                <button class="btn small" id="soundBtn" style="margin-top:10px">${settings.sound ? "On" : "Off"}</button>
              </div>
            </div>
            <div class="divider"></div>
            <div class="field" style="margin-top:0">
              <label>Timezone</label>
              <input id="tzInput" value="${escapeHtml(settings.timezone || "Local")}" />
            </div>
            <button class="btn" id="saveSettingsBtn" style="width:100%; margin-top:12px">Save settings</button>
          </div>
        </div>

        <div class="grid two" style="margin-top:16px">
          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Account</h3>
              <span class="badge">Local demo</span>
            </div>
            <div class="grid two">
              <div class="glass" style="padding:14px; border-radius:16px">
                <div style="font-weight:900">Change password</div>
                <div class="muted" style="margin-top:6px">Updates local password hash.</div>
                <button class="btn small" id="changePassBtn" style="margin-top:10px">Change</button>
              </div>
              <div class="glass" style="padding:14px; border-radius:16px">
                <div style="font-weight:900">Email verification</div>
                <div class="muted" style="margin-top:6px">Simulated email flow.</div>
                <button class="btn small" id="verifyEmailBtn" style="margin-top:10px">Send link</button>
              </div>
            </div>
            <div class="divider"></div>
            <button class="btn danger" id="deleteAccountBtn" style="width:100%">Delete account</button>
          </div>

          <div class="widget glass">
            <div class="widgetHeader">
              <h3>Data management</h3>
              <span class="badge">Export • Import</span>
            </div>
            <div class="row">
              <button class="btn small" id="exportBtn">Export data</button>
              <label class="btn small" style="cursor:pointer">
                Import data
                <input id="importInput" type="file" accept="application/json" style="display:none" />
              </label>
            </div>
            <div class="muted" style="margin-top:10px; line-height:1.45">
              Export downloads a JSON backup of your local data. Import replaces current local data.
            </div>
          </div>
        </div>
      `;

      ui.qs("#profileForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        store.update(st => ({
          ...st,
          users: st.users.map(u => u.id === user.id ? {
            ...u,
            username: (fd.get("username") || u.username).toString().trim() || u.username,
            avatar: (fd.get("avatar") || "").toString().trim().slice(0, 2),
            bio: (fd.get("bio") || "").toString().trim().slice(0, 220),
            goals: (fd.get("goals") || "").toString().trim().slice(0, 180),
          } : u),
        }));
        ui.toast("Saved", "Profile updated.");
      });

      ui.qs("#themeBtn").addEventListener("click", () => {
        store.update(st => ({ ...st, settings: { ...st.settings, theme: (st.settings.theme === "dark" ? "light" : "dark") } }));
        initTheme();
      });
      ui.qs("#soundBtn").addEventListener("click", () => {
        const next = store.update(st => ({ ...st, settings: { ...st.settings, sound: !st.settings.sound } }));
        ui.qs("#soundBtn").textContent = next.settings.sound ? "On" : "Off";
      });
      ui.qs("#saveSettingsBtn").addEventListener("click", () => {
        const tz = (ui.qs("#tzInput").value || "").trim();
        store.update(st => ({ ...st, settings: { ...st.settings, timezone: tz || st.settings.timezone } }));
        ui.toast("Saved", "Settings updated.");
      });

      ui.qs("#changePassBtn").addEventListener("click", () => {
        const next = prompt("New password (min 8 chars):");
        if (!next || next.length < 8) return ui.toast("Invalid", "Password must be at least 8 characters.");
        store.update(st => ({ ...st, users: st.users.map(u => u.id === user.id ? { ...u, passwordHash: hash(next) } : u) }));
        ui.toast("Updated", "Password changed (local demo).");
      });
      ui.qs("#verifyEmailBtn").addEventListener("click", () => {
        notifications.add(user.id, { type: "Email", message: "Verification link sent (simulated). You’re verified in this demo." });
        ui.toast("Sent", "Verification link added to notifications.");
      });
      ui.qs("#deleteAccountBtn").addEventListener("click", () => {
        const ok = confirm("Delete account and all your local data? This cannot be undone.");
        if (!ok) return;
        store.update(st => ({
          ...st,
          auth: { userId: null },
          users: st.users.filter(u => u.id !== user.id),
          habits: st.habits.filter(h => h.userId !== user.id),
          completions: st.completions.filter(c => c.userId !== user.id),
          notifications: st.notifications.filter(n => n.userId !== user.id),
          posts: st.posts.filter(p => p.userId !== user.id),
        }));
        location.href = "index.html";
      });

      ui.qs("#exportBtn").addEventListener("click", () => {
        const data = store.read();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "habitflow-backup.json";
        a.click();
        URL.revokeObjectURL(a.href);
      });
      ui.qs("#importInput").addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const text = await file.text();
        try {
          const parsed = JSON.parse(text);
          store.write(parsed);
          ui.toast("Imported", "Data imported. Reloading…");
          setTimeout(() => location.reload(), 600);
        } catch {
          ui.toast("Invalid file", "Could not parse JSON.");
        }
      });
    },
  };

  function featureCard(title, desc) {
    return `<div class="card glass"><div class="title">${escapeHtml(title)}</div><div class="desc">${escapeHtml(desc)}</div></div>`;
  }
  function testimonial(name, quote, stars) {
    return `<div class="card glass"><div class="title">${escapeHtml(name)} <span class="muted" style="font-weight:700">${escapeHtml(stars)}</span></div><div class="desc">${escapeHtml(quote)}</div></div>`;
  }
  function kpiCard(label, value, sub) {
    return `
      <div class="widget glass">
        <div class="widgetHeader">
          <h3>${escapeHtml(label)}</h3>
          <span class="badge">Live</span>
        </div>
        <div class="kpi">${escapeHtml(value)}</div>
        <div class="kpiSub">${escapeHtml(sub)}</div>
      </div>
    `;
  }
  function habitRow(h, done) {
    return `
      <div class="habitItem">
        <div class="habitMeta">
          <span class="habitDot" style="background:${escapeHtml(h.color || "#7C5CFF")}"></span>
          <div style="min-width:0">
            <div class="name">${escapeHtml(h.title || "Untitled")}</div>
            <div class="mini">${escapeHtml(h.category || "General")} • ${escapeHtml(h.frequency || "Daily")} • ${escapeHtml(h.difficulty || "Easy")}</div>
          </div>
        </div>
        <div class="habitActions">
          <button class="btn small ${done ? "primary" : ""}" data-toggle="${escapeHtml(h.id)}">${done ? "Done" : "Check in"}</button>
        </div>
      </div>
    `;
  }

  function pickQuote() {
    const quotes = [
      "Consistency beats intensity. Show up today.",
      "Your future self is built by today’s small choices.",
      "Win the morning, win the day.",
      "One perfect day is nice — a streak changes your identity.",
      "Don’t break the chain. If you do, restart fast.",
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  }

  function drawRing(canvasId, ratio, color) {
    const c = ui.qs(`#${canvasId}`);
    if (!c) return;
    const ctx = c.getContext("2d");
    const w = c.width = c.clientWidth * devicePixelRatio;
    const h = c.height = c.clientHeight * devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.32;
    const thickness = r * 0.28;
    ctx.lineCap = "round";

    const bg = getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "rgba(255,255,255,.15)";
    ctx.strokeStyle = bg;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18 * devicePixelRatio;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#fff";
    ctx.font = `${Math.floor(22 * devicePixelRatio)}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.round(ratio * 100)}%`, cx, cy - 6 * devicePixelRatio);

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "rgba(255,255,255,.7)";
    ctx.font = `${Math.floor(12 * devicePixelRatio)}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.fillText(`today`, cx, cy + 18 * devicePixelRatio);
  }

  function drawBar(canvasId, values, opts = {}) {
    const c = ui.qs(`#${canvasId}`);
    if (!c) return;
    const ctx = c.getContext("2d");
    const w = c.width = c.clientWidth * devicePixelRatio;
    const h = c.height = c.clientHeight * devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    const pad = 22 * devicePixelRatio;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    const max = Math.max(1, ...values);
    const barW = innerW / Math.max(values.length, 1);
    const accent = opts.accent || "#7C5CFF";
    const border = getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "rgba(255,255,255,.12)";

    // grid line
    ctx.strokeStyle = border;
    ctx.lineWidth = 1 * devicePixelRatio;
    ctx.beginPath();
    ctx.moveTo(pad, pad + innerH);
    ctx.lineTo(pad + innerW, pad + innerH);
    ctx.stroke();

    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const x = pad + i * barW + barW * 0.17;
      const bw = barW * 0.66;
      const bh = (v / max) * (innerH * 0.88);
      const y = pad + innerH - bh;
      const r = 10 * devicePixelRatio;
      ctx.fillStyle = "rgba(255,255,255,.06)";
      roundRect(ctx, x, pad + innerH - innerH * 0.88, bw, innerH * 0.88, r);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 18 * devicePixelRatio;
      roundRect(ctx, x, y, bw, bh, r);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawLine(canvasId, values, opts = {}) {
    const c = ui.qs(`#${canvasId}`);
    if (!c) return;
    const ctx = c.getContext("2d");
    const w = c.width = c.clientWidth * devicePixelRatio;
    const h = c.height = c.clientHeight * devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    const pad = 22 * devicePixelRatio;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    const accent = opts.accent || "#2EE59D";
    const border = getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "rgba(255,255,255,.12)";
    ctx.strokeStyle = border;
    ctx.lineWidth = 1 * devicePixelRatio;
    ctx.beginPath();
    ctx.moveTo(pad, pad + innerH);
    ctx.lineTo(pad + innerW, pad + innerH);
    ctx.stroke();

    const pts = values.map((v, i) => ({
      x: pad + (i / Math.max(values.length - 1, 1)) * innerW,
      y: pad + (1 - clamp(v, 0, 1)) * (innerH * 0.88) + innerH * 0.12,
    }));
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3.2 * devicePixelRatio;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 16 * devicePixelRatio;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // fill under line
    ctx.lineTo(pad + innerW, pad + innerH);
    ctx.lineTo(pad, pad + innerH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad, 0, pad + innerH);
    grad.addColorStop(0, accent + "33");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fill();
  }

  function drawPie(canvasId, values, opts = {}) {
    const c = ui.qs(`#${canvasId}`);
    if (!c) return;
    const ctx = c.getContext("2d");
    const w = c.width = c.clientWidth * devicePixelRatio;
    const h = c.height = c.clientHeight * devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.32;
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const colors = opts.colors || ["#7C5CFF", "#2EE59D", "#FFB020", "#64D2FF", "#FF4D6D"];
    let a0 = -Math.PI / 2;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const a1 = a0 + (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.shadowColor = colors[i % colors.length];
      ctx.shadowBlur = 14 * devicePixelRatio;
      ctx.fill();
      ctx.shadowBlur = 0;
      a0 = a1;
    }
    // inner cutout
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function smartInsights(state, userId) {
    const list = habits.listForUser(state, userId);
    if (!list.length) return "Create a few habits to unlock insights.";
    const weekly = habits.weeklyStats(state, userId);
    const bestHabit = list
      .map(h => ({ h, st: habits.streakForHabit(state, userId, h.id) }))
      .sort((a, b) => b.st.current - a.st.current)[0];
    const tip = weekly.rate < 0.5
      ? "Suggestion: reduce scope—focus on 2–3 habits until consistency rises."
      : weekly.rate < 0.85
        ? "Suggestion: schedule reminders for your weakest time of day."
        : "Suggestion: add one ‘stretch’ habit to keep progress exciting.";
    return `Best current streak: ${bestHabit.st.current} days (${bestHabit.h.title}). Consistency: ${Math.round(weekly.rate * 100)}%. ${tip}`;
  }

  function enableDragReorder(listRoot, userId) {
    let dragId = null;
    listRoot.addEventListener("dragstart", (e) => {
      const el = e.target.closest && e.target.closest("[data-drag]");
      if (!el) return;
      dragId = el.getAttribute("data-drag");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragId);
    });
    listRoot.addEventListener("dragover", (e) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    listRoot.addEventListener("drop", (e) => {
      e.preventDefault();
      const target = e.target.closest && e.target.closest("[data-drag]");
      if (!target) return;
      const targetId = target.getAttribute("data-drag");
      if (!dragId || dragId === targetId) return;
      store.update(s => {
        const hs = habits.listForUser(s, userId);
        const ids = hs.map(h => h.id);
        const from = ids.indexOf(dragId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return s;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        const nextHabits = s.habits.map(h => {
          const idx = ids.indexOf(h.id);
          if (h.userId !== userId || h.archived) return h;
          return idx >= 0 ? { ...h, order: idx + 1 } : h;
        });
        return { ...s, habits: nextHabits };
      });
      dragId = null;
      document.dispatchEvent(new CustomEvent("ht:rerender"));
    });
    document.addEventListener("ht:rerender", () => {});
  }

  // Placeholder: other pages registered later in file (kept small per patch chunk)
  window.HabitFlow = { store, ui, auth, habits, notifications, gamification, nowIsoDate, uid, escapeHtml, injectAppShell, pages, drawRing, drawBar, drawLine, drawPie };
})();
