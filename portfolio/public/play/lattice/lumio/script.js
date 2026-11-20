(function(){
        const curtain = document.getElementById('curtain');
        const nav = document.getElementById('nav');
        const handle = document.querySelector('.curtain__handle');
        const revealTarget = document.querySelector('.s2 .reveal');
        const s2El = document.querySelector('.s2');
        const s3El = document.querySelector('.s3');
        let s2Triggered = false;
        let s3Triggered = false;


        const burger = document.getElementById('navBurger');
        const drawer = document.getElementById('navDrawer');
        const drawerClose = document.getElementById('drawerClose');
        if (burger && drawer) {
          burger.addEventListener('click', () => drawer.classList.add('open'));
          if (drawerClose) drawerClose.addEventListener('click', () => drawer.classList.remove('open'));
          drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', () => drawer.classList.remove('open')));
        }

        function groupChWords(root){
          // wrap runs of letter spans in nowrap word containers so lines
          // never break mid-word on narrow viewports
          const parents = new Set();
          root.querySelectorAll('.ch').forEach(ch => parents.add(ch.parentNode));
          parents.forEach(p => {
            let word = null;
            [...p.childNodes].forEach(k => {
              const isLetter = k.nodeType === 1 && k.classList &&
                k.classList.contains('ch') && !k.classList.contains('sp');
              if (isLetter){
                if (!word){
                  word = document.createElement('span');
                  word.style.whiteSpace = 'nowrap';
                  word.style.display = 'inline-block';
                  p.insertBefore(word, k);
                }
                word.appendChild(k);
              } else {
                word = null;
              }
            });
          });
        }

        function animateCount(el){
          const target = parseFloat(el.dataset.count);
          const prefix = el.dataset.prefix || '';
          const suffix = el.dataset.suffix || '';
          const fmt = el.dataset.format;
          const dur = 1400;
          const start = performance.now();
          function step(now){
            const t = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - t, 3);
            const val = target * eased;
            let out;
            if (fmt === 'int') out = Math.round(val).toLocaleString('en-US');
            else if (fmt === 'dec1') out = val.toFixed(1);
            else out = String(val);
            el.textContent = prefix + out + suffix;
            if (t < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        }
        function triggerS2(){
          if (s2Triggered || !s2El) return;
          s2Triggered = true;

          const s2h2 = s2El.querySelector('.grid h2');
          if (s2h2 && !s2h2.dataset.split){
            s2h2.dataset.split = '1';
            let i = 0;
            const walk = (node) => {
              const kids = [...node.childNodes];
              for (const n of kids){
                if (n.nodeType === 3){
                  const frag = document.createDocumentFragment();
                  for (const ch of n.nodeValue){
                    if (ch === '\n') continue;
                    const s = document.createElement('span');
                    s.className = 'ch' + (ch === ' ' || ch === ' ' ? ' sp' : '');
                    s.style.setProperty('--i', i++);
                    s.textContent = ch === ' ' ? ' ' : ch;
                    frag.appendChild(s);
                  }
                  node.replaceChild(frag, n);
                } else if (n.nodeType === 1 && n.tagName !== 'BR'){
                  walk(n);
                }
              }
            };
            walk(s2h2);
            groupChWords(s2h2);
          }
          s2El.classList.add('s2-in');

          const ledeLines = s2El.querySelectorAll('.lede .sub-line');
          ledeLines.forEach((line, i) => {
            setTimeout(() => line.classList.add('in'), 450 + i * 220);
          });

          setTimeout(() => animateCount(document.querySelector('.stat.violet .v')), 1350);
          setTimeout(() => animateCount(document.querySelector('.stat.blue .v')), 1650);
        }

        function triggerS3(){
          if (s3Triggered || !s3El) return;
          s3Triggered = true;
          const s3h2 = s3El.querySelector('.s3-head h2');
          if (s3h2 && !s3h2.dataset.split){
            s3h2.dataset.split = '1';
            let i = 0;
            const walk = (node) => {
              const kids = [...node.childNodes];
              for (const n of kids){
                if (n.nodeType === 3){
                  const frag = document.createDocumentFragment();
                  for (const ch of n.nodeValue){
                    if (ch === '\n') continue;
                    const s = document.createElement('span');
                    s.className = 'ch' + (ch === ' ' || ch === ' ' ? ' sp' : '');
                    s.style.setProperty('--i', i++);
                    s.textContent = ch === ' ' ? ' ' : ch;
                    frag.appendChild(s);
                  }
                  node.replaceChild(frag, n);
                } else if (n.nodeType === 1 && n.tagName !== 'BR'){
                  walk(n);
                }
              }
            };
            walk(s3h2);
            groupChWords(s3h2);
          }


          const allCh    = [...s3h2.querySelectorAll('.ch')];
          const line2Ch  = [...s3h2.querySelectorAll('.it .ch')];
          const line1Count = allCh.length - line2Ch.length;

          const line2StartMs = 50 + (line1Count - 1) * 19 + 110;

          line2Ch.forEach((ch, idx) => {
            ch.style.animationDelay = (line2StartMs + idx * 19) + 'ms';
          });


          const cornerEl = s3El.querySelector('.s3-head .corner.l');
          if (cornerEl && !cornerEl.dataset.split){
            cornerEl.dataset.split = '1';
            const text = cornerEl.textContent;
            cornerEl.innerHTML = '';
            let ci = 0;
            for (const ch of text){
              const s = document.createElement('span');
              s.className = 'ch' + (ch === ' ' ? ' sp' : '');
              s.style.setProperty('--i', ci++);
              s.textContent = ch === ' ' ? ' ' : ch;
              cornerEl.appendChild(s);
            }
          }


          const cornerR = s3El.querySelector('.s3-head .corner.r');
          if (cornerR && !cornerR.dataset.split){
            cornerR.dataset.split = '1';
            const text = cornerR.textContent;
            cornerR.innerHTML = '';
            const spans = [];
            for (const ch of text){
              const s = document.createElement('span');
              s.className = 'ch' + (ch === ' ' ? ' sp' : '');
              s.textContent = ch === ' ' ? ' ' : ch;
              spans.push(s);
              cornerR.appendChild(s);
            }

            const total = spans.length;
            spans.forEach((s, idx) => {
              s.style.setProperty('--i', total - 1 - idx);
            });
          }

          s3El.classList.add('s3-in');
          const h2Done = line2StartMs + (line2Ch.length > 0 ? (line2Ch.length - 1) * 19 + 450 : 0);
          const subLines = s3El.querySelectorAll('.s3-head .sub-line');
          subLines.forEach((line, i) => {
            setTimeout(() => line.classList.add('in'), h2Done + i * 110);
          });

          const lastSubLineEnd = h2Done + (subLines.length - 1) * 110 + 350;
          setTimeout(() => {
            s3El.classList.add('s3-cards-in');


            setTimeout(() => {
              const conns = s3El.querySelectorAll('.card3.a .conn');
              const stampA = s3El.querySelector('.card3.a .stamp');
              stampA.classList.add('s3-reveal');
              conns.forEach((conn, i) => {
                setTimeout(() => conn.classList.add('s3-reveal'), i * 350);
              });
            }, 800);


            setTimeout(() => {
              const insightCard = s3El.querySelector('#insightCard');
              insightCard.classList.add('s3-reveal');
              const stampB = s3El.querySelector('.card3.b .stamp');
              stampB.classList.add('s3-reveal');

              setTimeout(() => {
                const saving = insightCard.querySelector('.saving');
                saving.classList.add('s3-reveal');

                const vEl = saving.querySelector('.v');
                const dur = 1400, startT = performance.now();
                function s3Count(now){
                  const t = Math.min(1, (now - startT) / dur);
                  const eased = 1 - Math.pow(1 - t, 3);
                  const val = Math.round(96 * eased);
                  vEl.innerHTML = val + '<em>% match</em>';
                  if (t < 1) requestAnimationFrame(s3Count);
                }
                requestAnimationFrame(s3Count);
              }, 700);
            }, 1050);


            setTimeout(() => {
              var runway = s3El.querySelector('.card3.c .runway');
              runway.classList.add('s3-reveal');
              var stampC = s3El.querySelector('.card3.c .stamp');
              stampC.classList.add('s3-reveal');


              setTimeout(function(){
                var chart     = s3El.querySelector('.card3.c .chart');
                var chartLine = chart.querySelector('.chart-line');
                var clipRect  = chart.querySelector('.chart-clip-rect');
                var chartDot  = chart.querySelector('.chart-dot');
                var badge     = chart.querySelector('.badge');

                var lineLen = chartLine.getTotalLength();


                var lineDur      = 5400;
                var DOT_STOP     = 0.65;
                var BADGE_APPEAR = 0.30;


                var startPt = chartLine.getPointAtLength(0);
                chartDot.style.left = (startPt.x / 280 * 100) + '%';
                chartDot.style.top  = (startPt.y / 140 * 100) + '%';
                chartDot.style.opacity = '1';


                var BADGE_OFFSET_Y = -30;

                var lineStart = performance.now();

                function animLine(now){
                  var t = Math.min(1, (now - lineStart) / lineDur);

                  var eased = 1 - Math.pow(1 - t, 3);


                  clipRect.setAttribute('width', String(eased * 280));


                  var dotProgress = Math.min(eased, DOT_STOP);
                  var pt = chartLine.getPointAtLength(dotProgress * lineLen);
                  var dotL = pt.x / 280 * 100;
                  var dotT = pt.y / 140 * 100;
                  chartDot.style.left = dotL + '%';
                  chartDot.style.top  = dotT + '%';


                  if (eased >= BADGE_APPEAR){
                    var bT = Math.min(1, (eased - BADGE_APPEAR) / 0.15);
                    badge.style.opacity = String(bT);
                    badge.style.left = dotL + '%';
                    badge.style.top  = (dotT + BADGE_OFFSET_Y) + '%';
                  }

                  if (t < 1){
                    requestAnimationFrame(animLine);
                  } else {

                    badge.style.opacity   = '1';
                    badge.style.transform = 'translateX(-50%)';
                  }
                }
                requestAnimationFrame(animLine);
              }, 750);
            }, 1300);
          }, lastSubLineEnd);
        }


        const CURTAIN_EASE = 'cubic-bezier(.7,0,.2,1)';
        const CURTAIN_DUR  = '1100ms';
        curtain.style.transition = `transform ${CURTAIN_DUR} ${CURTAIN_EASE}, box-shadow ${CURTAIN_DUR} ${CURTAIN_EASE}`;
        curtain.style.transform  = 'translateY(0)';

        function setCurtain(open){

          if (open){
            curtain.style.transform = `translateY(100vh)`;
            curtain.style.boxShadow = `0 54px 114px rgba(8,23,79,.60)`;
            if (handle) handle.style.opacity = 0;
          } else {
            curtain.style.transform = `translateY(0)`;
            curtain.style.boxShadow = `0 24px 60px rgba(8,23,79,.35)`;
            if (handle) handle.style.opacity = 1;
          }
        }
        function setNavForSection(idx){

          if (idx === 0){
            nav.classList.add('glass');
            nav.classList.remove('dark');
          } else {
            nav.classList.remove('glass');
            nav.classList.add('dark');
          }
        }


        let s4Triggered = false;
        function triggerS4(){
          if (s4Triggered) return;
          s4Triggered = true;

          const lumioTile  = document.querySelector('.tile.lumio');
          const lumioLabel = document.querySelector('.lumio-label');
          if (!lumioTile || !lumioLabel) return;


          const orbitTiles = [...document.querySelectorAll('.orbit-ring .tile')]
            .filter(t => t.style.display !== 'none');

          orbitTiles.forEach(t => { t._sc = 0; t._rMul = 0; });


          function easeOutBack(x){
            const c1 = 1.70158, c3 = c1 + 1;
            return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
          }

          function animSc(tile, dur, delay){
            tile._rMul = 0;
            tile._spiralOffset = -280;
            setTimeout(function(){
              var start = performance.now();
              (function step(now){
                var t = Math.min(1, (now - start) / dur);

                var easeOut = 1 - Math.pow(1 - t, 4);
                tile._rMul = Math.pow(easeOut, 0.618);

                var scEase = t < 0.8 ? 1 - Math.pow(1 - (t / 0.8), 4) : 1 + 0.08 * Math.sin((t - 0.8) / 0.2 * Math.PI);
                tile._sc = Math.max(0, Math.min(1.08, scEase));

                tile._spiralOffset = -280 * Math.pow(1 - t, 2.5);
                if (t < 1) requestAnimationFrame(step);
                else { tile._sc = 1; tile._rMul = 1; tile._spiralOffset = 0; }
              })(performance.now());
            }, delay);
          }


          lumioTile.style.transition = 'none';
          lumioTile.style.transform  = 'scale(0.001) translateY(40px)';
          lumioTile.style.opacity    = '0';
          var labelItems = [].slice.call(lumioLabel.querySelectorAll('.n, .k'));
          labelItems.forEach(function(el){
            el.style.transition = 'none';
            el.style.opacity    = '0';
            el.style.transform  = 'translateY(22px)';
          });


          void lumioTile.offsetHeight;
          void lumioLabel.offsetHeight;


          lumioTile.style.transition  = 'transform 1700ms cubic-bezier(0.34,1.45,0.64,1), opacity 1000ms ease';
          lumioTile.style.transform   = 'scale(1) translateY(0px)';
          lumioTile.style.opacity     = '1';


          labelItems.forEach(function(el, i){
            var delay = 1200 + i * 260;
            el.style.transition = 'opacity 1200ms ease ' + delay + 'ms, transform 1200ms cubic-bezier(0.34,1.35,0.64,1) ' + delay + 'ms';
            el.style.opacity   = '1';
            el.style.transform = 'translateY(0)';
          });


          const s4b = document.querySelector('.s4-bottom');
          const eyebrow4 = s4b && s4b.querySelector('.eyebrow');
          const syncStamp = document.querySelector('.sync-stamp');
          const s4h2 = s4b && s4b.querySelector('h2');
          const intPill = document.querySelector('.int-pill');


          if (s4h2 && !s4h2.dataset.split){
            s4h2.dataset.split = '1';
            const walk = (node) => {
              [...node.childNodes].forEach(c => {
                if (c.nodeType === 3){
                  const frag = document.createDocumentFragment();
                  for (const ch of c.textContent){
                    const s = document.createElement('span');
                    s.className = 'ch' + (ch === ' ' ? ' sp' : '');
                    s.textContent = ch === ' ' ? ' ' : ch;
                    frag.appendChild(s);
                  }
                  c.parentNode.replaceChild(frag, c);
                } else if (c.nodeType === 1 && c.tagName !== 'BR'){
                  walk(c);
                }
              });
            };
            walk(s4h2);
            groupChWords(s4h2);
          }


          setTimeout(() => {
            if (eyebrow4){
              eyebrow4.style.transition = 'opacity .8s ease, transform .8s cubic-bezier(.22,.61,.36,1)';
              eyebrow4.style.opacity = '1';
              eyebrow4.style.transform = 'translateY(0)';
            }
            if (syncStamp){
              syncStamp.style.transition = 'opacity .8s ease, transform .8s cubic-bezier(.22,.61,.36,1)';
              syncStamp.style.opacity = '1';
              syncStamp.style.transform = 'translateX(-50%) translateY(0)';
            }
          }, 1200);


          if (s4h2){
            const allCh4   = [...s4h2.querySelectorAll('.ch')];
            const line2Ch4 = [...s4h2.querySelectorAll('.it .ch')];
            const line2Set = new Set(line2Ch4);
            const line1Ch4 = allCh4.filter(c => !line2Set.has(c));
            const h2Start = 1700;
            line1Ch4.forEach((ch, idx) => {
              ch.style.animation = 'introLetterUp .45s cubic-bezier(.22,.61,.36,1) both';
              ch.style.animationDelay = (h2Start + idx * 19) + 'ms';
            });
            const line2Start4 = h2Start + (line1Ch4.length > 0 ? (line1Ch4.length - 1) * 19 + 110 : 0);
            line2Ch4.forEach((ch, idx) => {
              ch.style.animation = 'introLetterUp .45s cubic-bezier(.22,.61,.36,1) both';
              ch.style.animationDelay = (line2Start4 + idx * 19) + 'ms';
            });
          }


          if (intPill){
            intPill.style.animation = 's4PillPop 1.1s cubic-bezier(.22,.61,.36,1) 1500ms forwards';
          }


          const filterList = document.querySelector('.filter-list');
          if (filterList){
            setTimeout(() => {
              filterList.style.transition = 'transform 1100ms cubic-bezier(.22,.61,.36,1), opacity 800ms ease';
              filterList.style.transform = 'translateX(0)';
              filterList.style.opacity = '1';
            }, 2100);
          }


          const orbitEl = document.getElementById('orbit');
          const oRect = orbitEl.getBoundingClientRect();
          const cx = oRect.left + oRect.width / 2;
          const cy = oRect.top + oRect.height / 2;
          const ordered = orbitTiles.map(t => {
            const r = t.getBoundingClientRect();
            const tx = r.left + r.width / 2;
            const ty = r.top + r.height / 2;

            let ang = Math.atan2(tx - cx, cy - ty) * 180 / Math.PI;
            if (ang < 0) ang += 360;
            return { t, ang };
          }).sort((a, b) => a.ang - b.ang);
          ordered.forEach(function(o, i){
            animSc(o.t, 1800, 2100 + i * 160);
          });


          const lastOrbitDelay = 2100 + (ordered.length - 1) * 160 + 1800;
          setTimeout(function(){ window.__s4Done = true; }, lastOrbitDelay);
        }


        function initFullpage(){
          const wrap = document.getElementById('fullpage');
          if (!wrap) return;
          const sections = [...wrap.querySelectorAll(':scope > .section')];
          if (!sections.length) return;

          const mqMobile = window.matchMedia('(max-width: 900px)');
          mqMobile.addEventListener('change', () => location.reload());
          if (mqMobile.matches){
            // natural scroll: trigger section animations as they enter the viewport
            const watched = [
              { el: document.querySelector('.s2'), fn: triggerS2 },
              { el: document.querySelector('.s3'), fn: triggerS3 },
              { el: document.querySelector('.s4'), fn: triggerS4 }
            ];
            const onScroll = () => {
              const vh = window.innerHeight;
              const past = window.scrollY > vh * 0.7;
              nav.classList.toggle('dark', past);
              nav.classList.toggle('glass', !past);
              watched.forEach((s) => {
                if (!s.el || s.done) return;
                const r = s.el.getBoundingClientRect();
                if (r.top < vh * 0.7 && r.bottom > vh * 0.3){
                  s.done = true;
                  s.fn();
                }
              });
            };
            window.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('resize', onScroll, { passive: true });
            onScroll();
            return;
          }

          document.documentElement.classList.add('fp-enabled');


          wrap.style.position = 'fixed';
          wrap.style.top = '0';
          wrap.style.left = '0';
          wrap.style.width = '100%';
          wrap.style.zIndex = '1';
          wrap.style.transition = 'transform 1000ms cubic-bezier(.77,0,.18,1)';
          wrap.style.willChange = 'transform';

          let current = 0;
          let animating = false;

          function goTo(idx){
            idx = Math.max(0, Math.min(sections.length - 1, idx));
            if (idx === current || animating) return;
            const prev = current;
            current = idx;
            animating = true;
            wrap.style.transform = `translateY(-${idx * 100}vh)`;
            setNavForSection(idx);
            setCurtain(idx !== 0);
            if (idx === 1) triggerS2();
            if (idx === 2) triggerS3();
            if (idx === 3) triggerS4();
            setTimeout(() => { animating = false; }, 1050);
          }

          window.__latticeScrollToSection = function(anchor){
            const idx = sections.findIndex((section) => section.dataset.anchor === anchor || section.id === anchor);
            if (idx < 0) return;
            goTo(idx);
          };


          let wheelLock = false;
          window.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (wheelLock || animating) return;
            const dir = e.deltaY > 0 ? 1 : -1;
            if (Math.abs(e.deltaY) < 8) return;
            wheelLock = true;
            goTo(current + dir);
            setTimeout(() => { wheelLock = false; }, 1100);
          }, { passive: false });


          window.addEventListener('keydown', (e) => {
            if (['ArrowDown','PageDown',' '].includes(e.key)) { e.preventDefault(); goTo(current + 1); }
            else if (['ArrowUp','PageUp'].includes(e.key))   { e.preventDefault(); goTo(current - 1); }
            else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
            else if (e.key === 'End')  { e.preventDefault(); goTo(sections.length - 1); }
          });


          let touchY = null;
          window.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
          window.addEventListener('touchmove', (e) => {
            if (touchY == null || animating) return;
            const dy = touchY - e.touches[0].clientY;
            if (Math.abs(dy) > 40){
              goTo(current + (dy > 0 ? 1 : -1));
              touchY = null;
            }
          }, { passive: true });

          setNavForSection(0);
          setCurtain(false);
        }

        if (document.readyState === 'loading'){
          document.addEventListener('DOMContentLoaded', initFullpage);
        } else {
          initFullpage();
        }


        const empties = document.querySelectorAll('.tile.empty');
        const tilesA = document.querySelectorAll('.tile[data-group="a"]');
        const tilesB = document.querySelectorAll('.tile[data-group="b"]');


        function _easeOutBack(x){
          const c1 = 1.70158, c3 = c1 + 1;
          return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
        }
        function popInTile(tile, delay){
          tile._sc = 0;
          tile._rMul = 0;
          tile._spiralOffset = -300;
          setTimeout(function(){
            const dur = 900;
            const start = performance.now();
            (function step(now){
              const t = Math.min(1, (now - start) / dur);
              const easeOut = 1 - Math.pow(1 - t, 3);
              tile._sc = Math.max(0, Math.min(1.15, _easeOutBack(t)));
              tile._rMul = Math.pow(easeOut, 0.618);
              tile._spiralOffset = -300 * Math.pow(1 - t, 2);
              if (t < 1) requestAnimationFrame(step);
              else { tile._sc = 1; tile._rMul = 1; tile._spiralOffset = 0; }
            })(performance.now());
          }, delay);
        }

        function applyGroup(showB){
          tilesA.forEach(t => t.style.display = showB ? 'none' : 'grid');
          tilesB.forEach(t => t.style.display = showB ? 'grid' : 'none');
          empties.forEach(t => t.style.display = showB ? 'none' : 'grid');


          if (!window.__s4Done) return;
          const visible = [...document.querySelectorAll('.orbit-ring .tile')]
            .filter(t => t.style.display !== 'none');

          const orbitEl = document.getElementById('orbit');
          const oRect = orbitEl.getBoundingClientRect();
          const cx = oRect.left + oRect.width / 2;
          const cy = oRect.top + oRect.height / 2;
          const ordered = visible.map(t => {
            const r = t.getBoundingClientRect();
            const tx = r.left + r.width / 2;
            const ty = r.top + r.height / 2;
            let ang = Math.atan2(tx - cx, cy - ty) * 180 / Math.PI;
            if (ang < 0) ang += 360;
            return { t, ang };
          }).sort((a, b) => a.ang - b.ang);
          ordered.forEach((o, i) => popInTile(o.t, i * 90));
        }
        document.querySelectorAll('#filters button').forEach(btn => {
          btn.addEventListener('click', () => {
            document.querySelectorAll('#filters button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyGroup(btn.dataset.grp === 'b');
          });
        });
        applyGroup(false);


        (function spinFilters(){
          const list = document.getElementById('filters');
          if (!list) return;
          const items = Array.from(list.querySelectorAll('button'));
          const N = items.length;
          const STEP = 50;
          const BASE_SPEED = 0.0007;
          let offset = 0;
          let lastTime = performance.now();
          let mouseOver = false;
          let speedMult = 1;

          list.addEventListener('mouseenter', () => { mouseOver = true; speedMult = 0; });
          list.addEventListener('mouseleave', () => { mouseOver = false; speedMult = 1; });
          list.addEventListener('mousemove', (e) => {
            if (!mouseOver) return;
            const rect = list.getBoundingClientRect();
            const relY = (e.clientY - rect.top) / rect.height;
            const dist = relY - 0.5;
            if (Math.abs(dist) < 0.12) {
              speedMult = 0;
            } else {

              speedMult = dist * 4;
            }
          });


          items.forEach((btn, idx) => {
            btn.addEventListener('click', () => {
              items.forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              applyGroup(btn.dataset.grp === 'b');


              const target = idx;
              const cur = ((offset % N) + N) % N;

              let diff = target - cur;
              if (diff > N/2) diff -= N;
              if (diff < -N/2) diff += N;
              const goal = cur + diff;

              const start = performance.now();
              const dur = 500;
              const from = offset;
              const to = from + (goal - cur);
              function snap(now){
                const t = Math.min(1, (now - start) / dur);
                const eased = 1 - Math.pow(1 - t, 3);
                offset = from + (to - from) * eased;
                if (t < 1) requestAnimationFrame(snap);
                else offset = ((to % N) + N) % N;
              }
              requestAnimationFrame(snap);
            });
          });

          function tick(now) {
            const dt = now - lastTime;
            lastTime = now;
            offset = (offset + BASE_SPEED * dt * speedMult) % N;
            if (offset < 0) offset += N;

            const centerSlot = 2.5;
            items.forEach((el, i) => {
              let slot = ((i - offset) % N + N) % N;
              let pos = slot > N / 2 ? slot - N : slot;
              const y = (pos + centerSlot) * STEP;
              const d = Math.abs(pos);


              const opacity = d < 0.5  ? 1
                            : d < 1.5  ? 1   - (d-0.5)*0.2
                            : d < 2.5  ? 0.8 - (d-1.5)*0.35
                            : d < 3.5  ? 0.45- (d-2.5)*0.3
                            : 0;


              const scale = d < 0.5 ? 1 : Math.max(0.8, 1 - (d-0.5)*0.08);


              const blur = d < 1.0 ? 0 : Math.min(3, (d-1)*2);


              const lightness = Math.min(165, Math.round(14 + d * 70));
              const textAlpha  = d < 0.5 ? 1 : Math.max(0.35, 1 - d*0.28);

              el.style.transform   = `translate3d(0,${y}px,0) scale(${scale})`;
              el.style.opacity     = String(Math.max(0, opacity));
              el.style.filter      = blur > 0 ? `blur(${blur}px)` : '';
              el.style.color       = `rgba(${lightness},${lightness},${lightness},${textAlpha})`;
              el.style.background  = d < 0.5 ? '#fff' : 'rgba(14,10,7,.025)';
              el.style.boxShadow   = d < 0.5 ? '0 6px 18px rgba(14,10,7,.08)' : 'none';
              el.style.borderColor = 'rgba(14,10,7,.13)';
              el.style.zIndex      = String(100 - Math.round(d*10));
              el.style.display     = opacity > 0.01 ? '' : 'none';
            });
            requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        })();


        (function spinOrbit(){
          const tiles = document.querySelectorAll('.orbit-ring .tile');
          const baseMap = new Map();
          const baseAngles = {g2:0,g3:45,g6:90,g9:135,g8:180,g7:225,g4:270,g1:315};


          const posRot = [-0.991, 43.025, 90.926, 134.422, 179.009, 223.025, 270.926, 314.422];
          tiles.forEach(t => {
            const cls = [...t.classList].find(c => /^g[1-9]$/.test(c));
            baseMap.set(t, baseAngles[cls] ?? 0);
          });
          function rotAt(a){
            a = ((a % 360) + 360) % 360;
            const idx = a / 45;
            const i0 = Math.floor(idx) % 8;
            const i1 = (i0 + 1) % 8;
            const t = idx - Math.floor(idx);
            const r0 = posRot[i0], r1 = posRot[i1];
            const diff = ((r1 - r0 + 540) % 360) - 180;
            return r0 + diff * t;
          }
          const PERIOD = 32000;
          const orbit = document.getElementById('orbit');
          let R = 220;
          function measure(){
            if (!orbit) return;
            const w = orbit.getBoundingClientRect().width;
            const tileEl = orbit.querySelector('.orbit-ring .tile');
            const tw = tileEl ? tileEl.getBoundingClientRect().width : 136;
            R = Math.max(60, (w - tw) / 2);
          }
          measure();
          window.addEventListener('resize', measure);
          let last = performance.now(), offset = 0;
          function frame(now){
            const dt = now - last; last = now;
            offset = (offset + (dt / PERIOD) * 360) % 360;
            tiles.forEach(t => {
              const a = (baseMap.get(t) + offset + (t._spiralOffset ?? 0));
              const rot = rotAt(a);

          t.style.transform =
                `rotate(${a}deg) translateY(${-R * (t._rMul ?? 1)}px) rotate(${-a + rot}deg) scale(${t._sc ?? 0})`;

              t.style.setProperty('--rot', rot + 'deg');
            });
            requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        })();


        function countUp(el, duration) {
          const raw = el.textContent.trim();
          const prefix = raw.startsWith('$') ? '$' : '';
          const suffix = raw.endsWith('%') ? '%' : '';
          const target = parseInt(raw.replace(/[^0-9]/g, ''), 10);
          const start = performance.now();
          function fmt(n) {
            return prefix + Math.round(n).toLocaleString('en-US') + suffix;
          }
          el.textContent = fmt(0);
          function tick(now) {
            const p = Math.min((now - start) / duration, 1);
            const ease = 1 - Math.pow(1 - p, 3);
            el.textContent = fmt(target * ease);
            if (p < 1) requestAnimationFrame(tick);
            else el.textContent = raw;
          }
          requestAnimationFrame(tick);
        }

        function runIntro() {
          function splitLetters(root){
            let i = 0;
            const walk = (node) => {
              const kids = [...node.childNodes];
              for (const n of kids){
                if (n.nodeType === 3){
                  const frag = document.createDocumentFragment();
                  for (const ch of n.nodeValue){
                    if (ch === '\n') continue;
                    const s = document.createElement('span');
                    s.className = 'ch' + (ch === ' ' || ch === ' ' ? ' sp' : '');
                    s.style.setProperty('--i', i++);
                    s.textContent = ch === ' ' ? ' ' : ch;
                    frag.appendChild(s);
                  }
                  node.replaceChild(frag, n);
                } else if (n.nodeType === 1 && n.tagName !== 'BR'){
                  walk(n);
                }
              }
            };
            walk(root);
          }
          const centerLogo = document.getElementById('introCenterLogo');
          const navEl      = document.getElementById('nav');
          const h1         = document.querySelector('.hero h1');
          const sub        = document.querySelector('.hero p.sub');
          const ctasBtns   = document.querySelector('.hero .ctas');
          const browserEl  = document.querySelector('.browser');
          const brand      = document.querySelector('.nav .brand');
          const links      = [...document.querySelectorAll('.nav .links a')];
          const signin     = document.querySelector('.nav .right .signin');
          const ctaBtn     = document.querySelector('.nav .right .cta');


          setTimeout(() => centerLogo.classList.add('intro-logo-in'), 80);


          setTimeout(() => {
            centerLogo.classList.add('intro-logo-out');
            navEl.style.opacity = '1';
            navEl.classList.add('intro-nav-in');

            setTimeout(() => navEl.classList.add('nav-lines-go'), 160);
          }, 200);


          setTimeout(() => brand.classList.add('intro-brand-in'), 280);


          links.forEach((a, i) => {
            setTimeout(() => a.classList.add('intro-link-in'), 330 + i * 55);
          });


          const linksEnd = 330 + links.length * 55;
          setTimeout(() => signin.classList.add('intro-signin-in'), linksEnd + 60);


          setTimeout(() => {
            ctaBtn.classList.add('intro-cta-expand');
          }, linksEnd + 240);


          splitLetters(h1);
          groupChWords(h1);
          setTimeout(() => h1.classList.add('intro-h1-in'), linksEnd + 160);


          const h1Chars = h1.querySelectorAll('.ch').length;
          const h1Done = 160 + (h1Chars - 1) * 11 + 300;
          const subLines = sub.querySelectorAll('.sub-line');
          subLines.forEach((line, i) => {
            setTimeout(() => line.classList.add('in'), linksEnd + h1Done + i * 90);
          });
          const subEnd = h1Done + (subLines.length - 1) * 90 + 225;


          setTimeout(() => ctasBtns.classList.add('intro-btns-in'), linksEnd + subEnd + 120);


          setTimeout(() => {
            if (browserEl) browserEl.classList.add('intro-browser-in');

            setTimeout(() => {
              document.querySelectorAll('.kpi .val').forEach(el => countUp(el, 1500));
            }, 1500);
          }, linksEnd + subEnd + 300);


          setTimeout(() => navEl.classList.add('intro-done'), linksEnd + 900);


        }

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', runIntro);
        } else {
          runIntro();
        }
      })();


      document.querySelectorAll('svg use').forEach(u => {
        u.setAttribute('href', '#lattice-mark');
      });
