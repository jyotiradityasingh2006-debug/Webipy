(() => {
  'use strict';

  const $ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const $1 = (sel, ctx = document) => ctx.querySelector(sel);

  const State = {
    theme: 'dark',
    scrollY: 0,
    isMobileMenuOpen: false,
    formData: {},
    toasts: [],
    init() {
      this.theme = localStorage.getItem('theme') || 'dark';
      document.documentElement.setAttribute('data-theme', this.theme);
    },
    setTheme(t) {
      this.theme = t;
      localStorage.setItem('theme', t);
      document.documentElement.setAttribute('data-theme', t);
    }
  };

  const Utils = {
    debounce(fn, ms) {
      let t;
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    },
    throttle(fn, ms) {
      let last = 0;
      return (...args) => {
        const now = Date.now();
        if (now - last >= ms) { last = now; fn(...args); }
      };
    },
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    formatPhone: (phone) => phone.replace(/\D/g, '').replace(/^(\d{2})(\d{5})(\d{5})$/, '+$1 $2 $3'),
    validateEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    validatePhone: (phone) => /^\+?[\d\s-]{10,}$/.test(phone),
    generateId: () => Math.random().toString(36).slice(2, 9),
    scrollToTop: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    getWhatsAppUrl: (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
  };

  const Components = {
    ThemeToggle: {
      btn: null,
      init() {
        this.btn = $1('.theme-toggle');
        if (!this.btn) return;
        this.updateIcon();
        this.btn.addEventListener('click', () => this.toggle());
      },
      toggle() {
        const newTheme = State.theme === 'dark' ? 'light' : 'dark';
        State.setTheme(newTheme);
        this.updateIcon();
      },
      updateIcon() {
        this.btn.textContent = State.theme === 'dark' ? '☀️' : '🌙';
        this.btn.setAttribute('aria-pressed', State.theme === 'light');
      }
    },
    Navbar: {
      init() {
        this.nav = $1('nav');
        this.burger = $1('.hamburger');
        this.menu = $1('.nav-right');
        this.links = $('.nav-right a');
        this.bindEvents();
        this.setActiveLink();
      },
      bindEvents() {
        this.burger?.addEventListener('click', () => this.toggleMenu());
        this.links.forEach(a => {
          a.addEventListener('click', () => this.closeMenu());
          if (a.getAttribute('href').includes('appointment')) a.classList.add('nav-cta');
        });
        this.menu?.addEventListener('click', (e) => {
          if (e.target === this.menu) this.closeMenu();
        });
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && State.isMobileMenuOpen) this.closeMenu();
        });
      },
      toggleMenu() {
        State.isMobileMenuOpen = !State.isMobileMenuOpen;
        this.burger.classList.toggle('active', State.isMobileMenuOpen);
        this.menu.classList.toggle('active', State.isMobileMenuOpen);
        document.body.style.overflow = State.isMobileMenuOpen ? 'hidden' : '';
        this.burger.setAttribute('aria-expanded', State.isMobileMenuOpen);
      },
      closeMenu() {
        if (State.isMobileMenuOpen) {
          State.isMobileMenuOpen = false;
          this.burger.classList.remove('active');
          this.menu.classList.remove('active');
          document.body.style.overflow = '';
          this.burger.setAttribute('aria-expanded', 'false');
        }
      },
      setActiveLink() {
        const path = location.pathname;
        this.links.forEach(a => {
          const href = a.getAttribute('href');
          if (href && !href.startsWith('#') && path.endsWith(href)) {
            a.classList.add('current');
            a.setAttribute('aria-current', 'page');
          }
        });
      },
      updateScrolled(scrolled) {
        this.nav.classList.toggle('scrolled', scrolled);
      }
    },

    BackToTop: {
      btn: null,
      init() {
        this.btn = document.createElement('button');
        this.btn.id = 'top';
        this.btn.setAttribute('aria-label', 'Back to top');
        this.btn.innerHTML = '↑';
        this.btn.onclick = Utils.scrollToTop;
        document.body.append(this.btn);
      },
      update(show) {
        this.btn?.classList.toggle('show', show);
      }
    },

    Toast: {
      container: null,
      init() {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.style.cssText = `
          position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
          display: flex; flex-direction: column; gap: 10px; z-index: 200; pointer-events: none;
        `;
        document.body.append(this.container);
      },
      show(message, type = 'success', duration = 4000) {
        const toast = document.createElement('div');
        const colors = {
          success: 'var(--ac)',
          error: '#dc2743',
          info: 'var(--ac2)'
        };
        toast.style.cssText = `
          background: ${colors[type]}; color: var(--ink); font-weight: 700;
          padding: 14px 24px; border-radius: 999px; box-shadow: 0 20px 40px -12px #000;
          transform: translateY(120px); opacity: 0; transition: all .5s var(--ease);
          pointer-events: auto; white-space: nowrap;
        `;
        toast.textContent = message;
        this.container.append(toast);
        requestAnimationFrame(() => {
          toast.style.transform = 'translateY(0)';
          toast.style.opacity = '1';
        });
        setTimeout(() => {
          toast.style.transform = 'translateY(120px)';
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 500);
        }, duration);
      }
    },

    Rotator: {
      el: null,
      words: [],
      index: 0,
      init() {
        this.el = $1('.rotator');
        if (!this.el) return;
        this.words = (this.el.dataset.words || '').split(',');
        if (this.words.length <= 1) return;
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
          this.interval = setInterval(() => this.rotate(), 2400);
        }
      },
      rotate() {
        this.el.classList.add('out');
        setTimeout(() => {
          this.index = (this.index + 1) % this.words.length;
          this.el.textContent = this.words[this.index];
          this.el.classList.remove('out');
        }, 350);
      },
      destroy() {
        clearInterval(this.interval);
      }
    },

    Spotlight: {
      hero: null,
      init() {
        this.hero = $1('.home-hero');
        if (!this.hero) return;
        this.hero.addEventListener('pointermove', (e) => this.move(e));
      },
      move(e) {
        const r = this.hero.getBoundingClientRect();
        this.hero.style.setProperty('--hx', `${(e.clientX - r.left) / r.width * 100}%`);
        this.hero.style.setProperty('--hy', `${(e.clientY - r.top) / r.height * 100}%`);
      }
    },

    Reveal: {
      observer: null,
      init() {
        this.observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add('in');
              this.observer.unobserve(entry.target);
            }
          });
        }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });

        const selectors = 'section>h2, .benefits>div, .price-card, .solution-card, .service-card, .portfolio-grid>*, .booking-form, .why-us .benefits>div';
        $(selectors).forEach(el => {
          el.classList.add('reveal');
          this.observer.observe(el);
        });
      }
    },

    GlowCards: {
      cards: [],
      init() {
        this.cards = $('.benefits>div, .price-card, .solution-card, .service-card, .portfolio-grid>*');
        this.cards.forEach(c => {
          c.classList.add('glow');
          c.addEventListener('pointermove', (e) => this.updateGlow(c, e));
          c.addEventListener('pointerleave', () => this.resetGlow(c));
        });
      },
      updateGlow(card, e) {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      },
      resetGlow(card) {
        card.style.removeProperty('--mx');
        card.style.removeProperty('--my');
      }
    },

    ServicesDrag: {
      init() {
        $('.services-track').forEach(track => {
          let isDown = false, startX = 0, scrollLeft = 0;
          track.addEventListener('pointerdown', (e) => {
            if (e.pointerType !== 'mouse') return;
            isDown = true;
            startX = e.clientX;
            scrollLeft = track.scrollLeft;
            track.classList.add('drag');
            track.setPointerCapture(e.pointerId);
          });
          track.addEventListener('pointerup', () => {
            isDown = false;
            track.classList.remove('drag');
          });
          track.addEventListener('pointermove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            track.scrollLeft = scrollLeft - (e.clientX - startX);
          });
          track.addEventListener('pointerleave', () => {
            isDown = false;
            track.classList.remove('drag');
          });
        });
      }
    },

    Accordion: {
      init() {
        $('[data-accordion]>div').forEach((item, i) => {
          const h3 = $1('h3', item);
          const p = $1('p', item);
          if (!h3 || !p) return;

          const btn = document.createElement('button');
          btn.className = 'q';
          btn.type = 'button';
          btn.textContent = h3.textContent;
          btn.setAttribute('aria-expanded', 'false');
          h3.textContent = '';
          h3.append(btn);

          const answer = document.createElement('div');
          answer.className = 'a';
          p.replaceWith(answer);
          answer.append(p);

          btn.onclick = () => this.toggle(item, btn);
          if (i === 0) btn.click();
        });
      },
      toggle(item, btn) {
        const open = !item.classList.contains('open');
        $('[data-accordion]>div.open').forEach(o => {
          o.classList.remove('open');
          $1('.q', o)?.setAttribute('aria-expanded', 'false');
        });
        item.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', open);
      }
    },

    FormValidator: {
      rules: {
        name: { required: true, min: 2, message: 'Name must be at least 2 characters' },
        email: { required: true, validate: Utils.validateEmail, message: 'Enter a valid email' },
        plan: { required: true, message: 'Please select a plan' },
        date: { required: true, message: 'Please select a date' },
        time: { required: true, message: 'Please select a time' },
        message: { required: true, min: 10, message: 'Please provide more details (min 10 chars)' }
      },
      validate(form) {
        const data = new FormData(form);
        const errors = {};
        Object.entries(this.rules).forEach(([field, rule]) => {
          const value = data.get(field)?.trim() || '';
          if (rule.required && !value) {
            errors[field] = rule.message;
          } else if (value && rule.validate && !rule.validate(value)) {
            errors[field] = rule.message;
          } else if (value && rule.min && value.length < rule.min) {
            errors[field] = rule.message;
          }
        });
        return { isValid: Object.keys(errors).length === 0, errors, data: Object.fromEntries(data) };
      },
      showErrors(form, errors) {
        this.clearErrors(form);
        Object.entries(errors).forEach(([field, message]) => {
          const input = form.querySelector(`[name="${field}"]`);
          if (!input) return;
          input.setAttribute('aria-invalid', 'true');
          input.style.borderColor = '#dc2743';
          const error = document.createElement('span');
          error.className = 'form-error';
          error.style.cssText = 'color:#dc2743;font-size:13px;margin-top:4px;display:block';
          error.textContent = message;
          input.parentNode.append(error);
        });
      },
      clearErrors(form) {
        form.querySelectorAll('.form-error').forEach(e => e.remove());
        form.querySelectorAll('[aria-invalid]').forEach(i => {
          i.removeAttribute('aria-invalid');
          i.style.borderColor = '';
        });
      }
    },

    BookingForm: {
      form: null,
      init() {
        this.form = $1('#booking-form');
        if (!this.form) return;
        this.bindEvents();
        this.setMinDate();
      },
      setMinDate() {
        const dateInput = $1('#date');
        if (dateInput) dateInput.min = new Date().toISOString().split('T')[0];
      },
      bindEvents() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.form.querySelectorAll('input, select, textarea').forEach(input => {
          input.addEventListener('blur', () => this.validateField(input));
          input.addEventListener('input', () => this.clearFieldError(input));
        });
      },
      validateField(input) {
        const name = input.name;
        const rule = Components.FormValidator.rules[name];
        if (!rule) return true;
        const value = input.value.trim();
        if (rule.required && !value) {
          this.showFieldError(input, rule.message);
          return false;
        }
        if (value && rule.validate && !rule.validate(value)) {
          this.showFieldError(input, rule.message);
          return false;
        }
        if (value && rule.min && value.length < rule.min) {
          this.showFieldError(input, rule.message);
          return false;
        }
        return true;
      },
      showFieldError(input, message) {
        input.setAttribute('aria-invalid', 'true');
        input.style.borderColor = '#dc2743';
        this.clearFieldError(input);
        const error = document.createElement('span');
        error.className = 'form-error';
        error.style.cssText = 'color:#dc2743;font-size:13px;margin-top:4px;display:block';
        error.textContent = message;
        input.parentNode.append(error);
      },
      clearFieldError(input) {
        const error = input.parentNode.querySelector('.form-error');
        error?.remove();
        input.removeAttribute('aria-invalid');
        input.style.borderColor = '';
      },
      handleSubmit(e) {
        e.preventDefault();
        const { isValid, errors, data } = Components.FormValidator.validate(this.form);
        if (!isValid) {
          Components.FormValidator.showErrors(this.form, errors);
          const firstError = this.form.querySelector('[aria-invalid="true"]');
          firstError?.focus();
          Components.Toast.show('Please fix the errors above', 'error');
          return;
        }
        this.submitToWhatsApp(data);
      },
      submitToWhatsApp(data) {
        const message = `New Booking Request:\n\n` +
          `Name: ${data.name}\n` +
          `Email: ${data.email}\n` +
          `Plan: ${data.plan}\n` +
          `Preferred Date: ${data.date}\n` +
          `Preferred Time: ${data.time}\n` +
          `Project Details:\n${data.message}`;
        const url = Utils.getWhatsAppUrl('919238831545', message);
        console.log('Opening WhatsApp:', url);
        const w = window.open(url, '_blank');
        if (!w || w.closed || typeof w.closed === 'undefined') {
          // Popup blocked - fallback to direct navigation
          location.href = url;
        }
        Components.Toast.show('Opening WhatsApp with your request…', 'success');
        this.form.reset();
      }
    },

    ImageLoader: {
      init() {
        $('img').forEach(img => {
          const handleError = () => {
            img.style.visibility = 'hidden';
            img.style.display = 'none';
          };
          img.addEventListener('error', handleError);
          if (img.complete && !img.naturalWidth) handleError();
          if (img.dataset.src) {
            const observer = new IntersectionObserver((entries) => {
              entries.forEach(entry => {
                if (entry.isIntersecting) {
                  img.src = img.dataset.src;
                  observer.unobserve(img);
                }
              });
            });
            observer.observe(img);
          }
        });
      }
    },

    ScrollSpy: {
      init() {
        const sections = $('section[id]');
        const navLinks = $('.nav-right a[href^="#"]');
        if (!sections.length || !navLinks.length) return;

        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const id = entry.target.id;
              navLinks.forEach(link => {
                link.classList.toggle('current', link.getAttribute('href') === `#${id}`);
              });
            }
          });
        }, { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 });

        sections.forEach(s => observer.observe(s));
      }
    }
  };

  const App = {
    init() {
      document.documentElement.classList.add('js');
      State.init();
      Components.ThemeToggle.init();
      Components.Navbar.init();
      Components.BackToTop.init();
      Components.Toast.init();
      Components.Rotator.init();
      Components.Spotlight.init();
      Components.Reveal.init();
      Components.GlowCards.init();
      Components.ServicesDrag.init();
      Components.Accordion.init();
      Components.BookingForm.init();
      Components.ImageLoader.init();
      Components.ScrollSpy.init();
      this.bindGlobalEvents();
    },
    bindGlobalEvents() {
      const onScroll = Utils.throttle(() => {
        State.scrollY = window.scrollY;
        Components.Navbar.updateScrolled(State.scrollY > 20);
        Components.BackToTop.update(State.scrollY > 600);
      }, 16);
      window.addEventListener('scroll', onScroll, { passive: true });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
  } else {
    App.init();
  }

  window.Webipy = { State, Utils, Components };
})();