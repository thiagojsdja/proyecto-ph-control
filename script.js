document.addEventListener('DOMContentLoaded', () => {

    const $ = s => document.querySelector(s);
    const $$ = s => [...document.querySelectorAll(s)];

    (function handleNavbar() {
        const nav = $("header");
        if (!nav) return;
        const sections = $$("main section");
        const navLinks = $$(".nav a[href^='#']");

        function setActive(hash) {
            navLinks.forEach(a => a.classList.toggle("active", a.getAttribute("href") === hash));
        }

        const spyObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = "#" + entry.target.id;
                    setActive(id);
                }
            });
        }, { rootMargin: "-40% 0px -55% 0px", threshold: 0.01 });
        sections.forEach(sec => spyObserver.observe(sec));

        window.addEventListener("scroll", () => {
            nav.classList.toggle("scrolled", window.scrollY > 6);
        });
    })();

    (function handleScrollAnimations() {
        const revealObserver = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.classList.add("visible");
                    revealObserver.unobserve(e.target);
                }
            });
        }, { threshold: 0.08 });
        $$(".reveal").forEach(el => revealObserver.observe(el));
    })();

    let currentPhValue = 7.0;
    function animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const currentValue = progress * (end - start) + start;
            obj.innerHTML = `pH ${currentValue.toFixed(2)}`;
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    (function handleRealtimeChart() {
        const chartEl = $("#phChart");
        if (!chartEl) return;

        const endpoint = "http://localhost:5000/ph";
        $("#endpoint-label").textContent = endpoint;

        const ctx = chartEl.getContext("2d");
        const MAX_POINTS = 36;

        const phChart = new Chart(ctx, {
            type: "line",
            data: { labels: [], datasets: [{ label: "pH", data: [], borderColor: "rgba(13,110,253,0.95)", backgroundColor: "rgba(13,110,253,0.10)", borderWidth: 2, tension: 0.25, pointRadius: 0 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
                scales: { x: { ticks: { autoSkip: true, maxTicksLimit: 6 }, grid: { display: false } }, y: { min: 0, max: 14, grid: { color: "rgba(0,0,0,0.06)" } } }
            }
        });

        const badge = $("#ph-badge"), valueEl = $("#ph-value"), statusEl = $("#ph-status"), connEl = $("#conn-status");

        function hexToRgba(hex, alpha) {
            const h = hex.replace('#', '');
            const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
            const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        function statusFromPH(ph) {
            if (ph < 6.5) return { label: "Ácido", cls: "acid", color: getComputedStyle(document.documentElement).getPropertyValue('--acid').trim() || "#ff4d4f" };
            if (ph > 7.5) return { label: "Básico", cls: "basic", color: getComputedStyle(document.documentElement).getPropertyValue('--basic').trim() || "#3b82f6" };
            return { label: "Neutro", cls: "neutral", color: getComputedStyle(document.documentElement).getPropertyValue('--neutral').trim() || "#22c55e" };
        }

        function updateUI(ph, ts) {
            const s = statusFromPH(ph);
            badge.className = `badge ${s.cls}`;
            badge.textContent = s.label;

            animateValue(valueEl, currentPhValue, ph, 500);
            currentPhValue = ph;

            statusEl.textContent = `Estado: ${s.label} — ${new Date(ts).toLocaleTimeString()}`;
            phChart.data.datasets[0].borderColor = s.color;
            phChart.data.datasets[0].backgroundColor = hexToRgba(s.color, 0.15);
        }

        function pushPoint(ph, ts) {
            const lbl = new Date(ts).toLocaleTimeString();
            phChart.data.labels.push(lbl);
            phChart.data.datasets[0].data.push(ph);
            if (phChart.data.labels.length > MAX_POINTS) {
                phChart.data.labels.shift();
                phChart.data.datasets[0].data.shift();
            }
            phChart.update("none");
        }

        let isSimulating = false, pollInterval = 1000, pollTimer = null, simTimer = null, simVal = 7.0;

        async function fetchWithTimeout(url, opts = {}, timeout = 4000) {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            const res = await fetch(url, { ...opts, signal: controller.signal });
            clearTimeout(id);
            return res;
        }

        async function getPH() {
            if (isSimulating) return;
            connEl.textContent = "Conexión: consultando...";
            try {
                const res = await fetchWithTimeout(endpoint);
                if (!res.ok) throw new Error("HTTP " + res.status);
                const data = await res.json();
                const ph = Number(data.ph);
                const ts = (data.timestamp ? Number(data.timestamp) * 1000 : Date.now());

                if (!Number.isFinite(ph)) throw new Error("Dato inválido");
                updateUI(ph, ts);
                pushPoint(ph, ts);
                connEl.textContent = "Conexión: OK (Datos Reales)";
                stopSimulation();
            } catch (e) {
                connEl.textContent = `Conexión: error (${e.message}). Activando simulación.`;
                if (!isSimulating) {
                    startSimulation(true);
                }
            }
        }
        
        function startSimulation(isFallback = false) {
            if (isSimulating) return;
            isSimulating = true;
            $("#toggle-sim").textContent = "Detener Simulación";
            connEl.textContent = isFallback ? `Conexión: simulación por error` : `Conexión: simulación manual activa`;

            simTimer = setInterval(() => {
                simVal += (Math.random() - 0.5) * 0.15;
                simVal = Math.max(0, Math.min(14, simVal));
                const ts = Date.now();
                updateUI(simVal, ts);
                pushPoint(simVal, ts);
            }, 1500);
        }

        function stopSimulation() {
            if (!isSimulating) return;
            isSimulating = false;
            clearInterval(simTimer);
            simTimer = null;
            $("#toggle-sim").textContent = "Simular Datos";
            connEl.textContent = "Conexión: inactiva";
        }
        
        $("#toggle-sim").addEventListener("click", () => isSimulating ? stopSimulation() : startSimulation(false));
        $("#force-refresh").addEventListener("click", () => { if (!isSimulating) getPH(); });
        $("#copy-endpoint").addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(endpoint);
                const btn = $("#copy-endpoint");
                const prev = btn.textContent;
                btn.textContent = "Copiado ✓";
                setTimeout(() => btn.textContent = prev, 1200);
            } catch (err) { console.error("Error al copiar:", err); }
        });

        (function init() {
            for (let i = 0; i < 5; i++) { pushPoint(7, Date.now() - (5 - i) * 1000); }
            updateUI(7, Date.now());
            getPH();
            pollTimer = setInterval(getPH, pollInterval);
        })();
    })();

    (function handleContactForm() {
        const form = $("#contact-form");
        if (!form) return;
        const formStatus = $("#form-status");
        const nameInput = $("#name");
        const emailInput = $("#email");
        const messageInput = $("#message");

        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const name = nameInput.value.trim();
            const email = emailInput.value.trim();
            const message = messageInput.value.trim();

            if (!name || !email || !message) {
                formStatus.textContent = "Por favor, completa todos los campos.";
                formStatus.style.color = "var(--acid)";
                return;
            }

            formStatus.textContent = "Enviando...";
            formStatus.style.color = "var(--text)";

            try {
                const res = await fetch(form.action, { 
                    method: "POST", 
                    body: new FormData(form), 
                    headers: { "Accept": "application/json" } 
                });
                
                if (res.ok) {
                    form.reset();
                    formStatus.textContent = "¡Mensaje enviado! Te responderemos pronto.";
                    formStatus.style.color = "var(--neutral)";
                } else {
                    throw new Error("Respuesta no fue OK");
                }
            } catch (err) {
                formStatus.textContent = "No se pudo enviar. Intenta de nuevo más tarde.";
                formStatus.style.color = "var(--acid)";
            }

            setTimeout(() => {
                formStatus.textContent = "";
            }, 5000);
        });
    })();

    (function handlePhScale() {
        const phBar = $("#ph-bar");
        const infoValue = $("#ph-info-value");
        const infoLabel = $("#ph-info-label");
        if (!phBar || !infoValue || !infoLabel) return;

        const phExamples = [
            { value: 0, label: "Ácido de Batería" }, { value: 1, label: "Ácido Estomacal" },
            { value: 2, label: "Jugo de Limón" }, { value: 3, label: "Vinagre" },
            { value: 4, label: "Jugo de Tomate" }, { value: 5, label: "Café Negro" },
            { value: 6, label: "Leche" }, { value: 7, label: "Agua Pura" },
            { value: 8, label: "Agua de Mar" }, { value: 9, label: "Bicarbonato de Sodio" },
            { value: 10, label: "Leche de Magnesia" }, { value: 11, label: "Amoníaco" },
            { value: 12, label: "Agua Jabonosa" }, { value: 13, label: "Blanqueador" },
            { value: 14, label: "Limpiador de Desagües" }
        ];

        for (let i = 0; i < 14; i++) {
            const tick = document.createElement('div');
            tick.className = 'ph-tick';
            phBar.appendChild(tick);
        }

        phBar.addEventListener("mousemove", (e) => {
            const rect = phBar.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const ph = (x / rect.width) * 14;
            const nearestPh = Math.round(ph);
            
            infoValue.textContent = `pH ${ph.toFixed(1)}`;
            infoLabel.textContent = phExamples[nearestPh].label;
        });

        phBar.addEventListener("mouseleave", () => {
            infoValue.textContent = `pH 7.0`;
            infoLabel.textContent = `Agua Pura`;
        });
    })();

    if (typeof particlesJS !== 'undefined') {
        particlesJS("particles-js", {
            "particles": {
                "number": { "value": 50, "density": { "enable": true, "value_area": 800 } },
                "color": { "value": "#00bfff" },
                "shape": { "type": "circle" },
                "opacity": { "value": 0.5, "random": true, "anim": { "enable": true, "speed": 0.5, "opacity_min": 0.1, "sync": false } },
                "size": { "value": 4, "random": true, "anim": { "enable": false } },
                "line_linked": { "enable": false },
                "move": { "enable": true, "speed": 1, "direction": "top", "random": true, "straight": false, "out_mode": "out", "bounce": false }
            },
            "interactivity": { "detect_on": "canvas", "events": { "onhover": { "enable": false }, "onclick": { "enable": false }, "resize": true } },
            "retina_detect": true
        });
    }

    (function handleTeamModals() {
        const openModalButtons = $$('[data-modal-target]');
        const modals = $$('.modal');

        openModalButtons.forEach(button => {
            button.addEventListener('click', () => {
                const modal = $(button.dataset.modalTarget);
                openModal(modal);
            });
        });

        modals.forEach(modal => {
            const closeModalButton = modal.querySelector('.modal-cerrar');
            closeModalButton.addEventListener('click', () => {
                closeModal(modal);
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal(modal);
                }
            });
        });
        
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const openModal = $('.modal.visible');
                if (openModal) {
                    closeModal(openModal);
                }
            }
        });

        function openModal(modal) {
            if (modal == null) return;
            modal.classList.add('visible');
            document.body.classList.add('modal-abierto');
        }

        function closeModal(modal) {
            if (modal == null) return;
            modal.classList.remove('visible');
            document.body.classList.remove('modal-abierto');
        }
    })();

    (function handleMobileMenu() {
        const nav = $('nav');
        const menuBtn = $('#btn-menu');
        if (!nav || !menuBtn) return;

        menuBtn.addEventListener('click', () => {
            nav.classList.toggle('visible');
            const isExpanded = nav.classList.contains('visible');
            menuBtn.setAttribute('aria-expanded', isExpanded);
        });

        $$('nav a').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('visible');
                menuBtn.setAttribute('aria-expanded', false);
            });
        });
    })();

});