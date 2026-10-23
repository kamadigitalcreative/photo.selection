// test/phase56r-hero-correctness.test.js
// Automated regression & correctness tests for Phase 5.6R Hero Customizer & Demo Flow patch

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('======================================================');
console.log('PHASE 5.6R HERO CORRECTNESS & DEMO FLOW REGRESSION');
console.log('======================================================\n');

let passCount = 0;
let failCount = 0;

function check(cond, id, desc) {
    if (cond) {
        passCount++;
        console.log(`✅ [PASS] ${id}: ${desc}`);
    } else {
        failCount++;
        console.error(`❌ [FAIL] ${id}: ${desc}`);
    }
}

const appHtmlPath = path.join(__dirname, '..', 'app.html');
const appHtml = fs.readFileSync(appHtmlPath, 'utf8');

const roleShellCssPath = path.join(__dirname, '..', 'assets', 'css', 'role-shell.css');
const roleShellCss = fs.readFileSync(roleShellCssPath, 'utf8');

const browserUatPath = path.join(__dirname, '..', 'test', 'phase55-browser-uat.js');
const browserUat = fs.readFileSync(browserUatPath, 'utf8');

// --- 1. HERO IMAGE PRESENTATION & STACKING ---
const hasHeroImgInHtml = appHtml.includes('id="photographerHeroImg"');
check(hasHeroImgInHtml, 'HERO-01', 'photographerHeroImg element is present in app.html');

const hasFallbackInHtml = appHtml.includes('id="photographerHeroFallback"');
check(hasFallbackInHtml, 'HERO-02', 'photographerHeroFallback element is present in app.html');

const rendersImgInJs = appHtml.includes("heroImg.src = saved.imageUrl") && appHtml.includes("heroImg.style.display = 'block'");
check(rendersImgInJs, 'HERO-03', 'renderPhotographerHeroBanner assigns image to heroImg and displays it prominently');

const hidesFallbackWhenCustom = appHtml.includes("heroFallback.style.display = 'none'") && appHtml.includes("heroFallback.classList.add('hidden')");
check(hidesFallbackWhenCustom, 'HERO-04', 'renderPhotographerHeroBanner hides fallback artwork when custom image exists');

const showsFallbackWhenNoCustom = appHtml.includes("heroFallback.style.display = 'flex'") && appHtml.includes("heroFallback.classList.remove('hidden')");
check(showsFallbackWhenNoCustom, 'HERO-05', 'renderPhotographerHeroBanner displays theme-aware fallback artwork when no custom image exists');

const hasCustomHeroClassApplied = appHtml.includes("mediaContainer.classList.add('has-custom-hero')");
check(hasCustomHeroClassApplied, 'HERO-06', 'mediaContainer is tagged with has-custom-hero class when custom image exists');

// --- 2. CSS RESPONSIVE TREATMENT & OVERLAY ---
const mobileCustomHeroOpacity = roleShellCss.includes('#admin-view .photographer-hero-media.has-custom-hero') &&
                               roleShellCss.includes('opacity: 1 !important;');
check(mobileCustomHeroOpacity, 'CSS-01', 'Mobile rules set opacity: 1 !important for has-custom-hero (no washed-out opacity: 0.25)');

const mobileCustomHeroOverlay = roleShellCss.includes('#admin-view .photographer-hero-media.has-custom-hero .photographer-hero-overlay');
check(mobileCustomHeroOverlay, 'CSS-02', 'Mobile rules define a dedicated subtle readability overlay for custom hero');

const cssCustomPropsApplied = roleShellCss.includes('--hero-fx') && roleShellCss.includes('--hero-fy') && roleShellCss.includes('--hero-zoom');
check(cssCustomPropsApplied, 'CSS-03', 'CSS utilizes CSS custom properties (--hero-fx, --hero-fy, --hero-zoom) on hero image');

const cssDtMediaProps = roleShellCss.includes('--hero-focal-x-dt') && roleShellCss.includes('--hero-focal-y-dt');
check(cssDtMediaProps, 'CSS-04', 'CSS media query binds desktop custom properties (--hero-focal-x-dt, --hero-focal-y-dt)');

const cssMbMediaProps = roleShellCss.includes('--hero-focal-x-mb') && roleShellCss.includes('--hero-focal-y-mb');
check(cssMbMediaProps, 'CSS-05', 'CSS media query binds mobile custom properties (--hero-focal-x-mb, --hero-focal-y-mb)');

// --- 3. SEPARATE DESKTOP AND MOBILE CROPPING IN STATE & UI ---
const hasDesktopAndMobileState = appHtml.includes('desktop: { focalX: 50, focalY: 50, zoom: 100 }') &&
                                appHtml.includes('mobile: { focalX: 50, focalY: 50, zoom: 100 }');
check(hasDesktopAndMobileState, 'STATE-01', 'heroCustomizerState contains independent desktop and mobile crop settings');

const setHeroPreviewHandlesBoth = appHtml.includes("(mode === 'mobile') ? heroCustomizerState.mobile : heroCustomizerState.desktop");
check(setHeroPreviewHandlesBoth, 'STATE-02', 'setHeroPreviewMode dynamically loads active device settings into sliders');

const updateFocalHandlesBoth = appHtml.includes("heroCustomizerState.mobile.focalX = fx") &&
                               appHtml.includes("heroCustomizerState.desktop.focalX = fx");
check(updateFocalHandlesBoth, 'STATE-03', 'updateHeroBannerFocalPoint saves adjustments independently to active preview mode');

const applySettingsSavesBoth = appHtml.includes("desktop: {") && appHtml.includes("mobile: {") &&
                               appHtml.includes("focalX: heroCustomizerState.desktop.focalX");
check(applySettingsSavesBoth, 'STATE-04', 'applyHeroBannerSettings persists both desktop and mobile payloads with legacy fallback');

const backwardCompatLoading = appHtml.includes("if (!parsed.desktop)") && appHtml.includes("if (!parsed.mobile)");
check(backwardCompatLoading, 'STATE-05', 'loadSavedHeroBanner provides seamless backward compatibility for legacy single-crop configs');

// --- 4. SAFE STORAGE & CLIENT-SIDE DOWNSAMPLING ---
const hasCanvasOptimization = appHtml.includes("canvas.toDataURL('image/jpeg', 0.85)") || appHtml.includes("canvas.getContext('2d')");
check(hasCanvasOptimization, 'STOR-01', 'handleHeroBannerUpload optimizes uploaded images on canvas before storing (~200KB quota safety)');

const hasQuotaCatch = appHtml.includes("catch (e)") && appHtml.includes("Kapasitas penyimpanan lokal browser tidak mencukupi");
check(hasQuotaCatch, 'STOR-02', 'applyHeroBannerSettings catches storage quota exceptions without corrupting existing saved banner');

// --- 5. DEMO LOGIN COMPATIBILITY & DUPLICATE FUNCTIONS ---
const isDemoDeclarations = (appHtml.match(/function\s+isDemoAccount\s*\(/g) || []).length;
check(isDemoDeclarations === 1, 'DEMO-01', `isDemoAccount() declared exactly once (found: ${isDemoDeclarations})`);

const showDemoDeclarations = (appHtml.match(/function\s+showDemoSubscribeAlert\s*\(/g) || []).length;
check(showDemoDeclarations === 1, 'DEMO-02', `showDemoSubscribeAlert() declared exactly once (found: ${showDemoDeclarations})`);

const demoAutoLoginPassword = appHtml.includes("uPass.value = 'password123';");
check(demoAutoLoginPassword, 'DEMO-03', '?demo=true auto-login handler populates standardized password123');

const mockAcceptsBothDemoPasswords = browserUat.includes("password === 'password123' || password === 'demo'");
check(mockAcceptsBothDemoPasswords, 'DEMO-04', 'Mock server accepts password123 and legacy demo password for demo users');

// --- 6. SCRIPT INVARIANTS ---
const scriptTagMatches = (appHtml.match(/<script/gi) || []).length;
check(scriptTagMatches === 12, 'REG-01', `Script tag count preserved at exactly 12 (found: ${scriptTagMatches})`);

console.log('\n======================================================');
console.log(`PHASE 5.6R HERO CORRECTNESS SUMMARY: ${passCount} PASSED | ${failCount} FAILED`);
console.log('======================================================\n');

if (failCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
