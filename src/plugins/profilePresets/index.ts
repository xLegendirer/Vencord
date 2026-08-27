import * as DataStore from "@api/DataStore";
import definePlugin from "@utils/types";
import { RestAPI, UserStore } from "@webpack/common";

interface ProfilePreset {
    bio?: string;
    avatarBase64?: string | null;
    bannerBase64?: string | null;
    themeColors?: number[] | null;
    profileEffectId?: string | null;
}

const STORAGE_KEY = "ProfilePresets_data";
let observer: MutationObserver | null = null;
let currentSelectedPreset: string | null = null;

async function fetchImageAsBase64(url: string, ext: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Görsel indirilemedi: " + url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            let result = reader.result as string;
            // Bazen Discord CDN formatı gizleyebilir, doğru başlığı zorla ekliyoruz
            if (result.startsWith("data:application/octet-stream")) {
                const mimeType = ext === "gif" ? "image/gif" : "image/png";
                result = result.replace("data:application/octet-stream", `data:${mimeType}`);
            }
            resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function renderPresetsUI(container: HTMLElement) {
    const data: Record<string, ProfilePreset> = (await DataStore.get(STORAGE_KEY)) || {};
    const keys = Object.keys(data);
    
    let listHTML = "";
    
    if (keys.length === 0) {
        listHTML = `<div style="color: #b5bac1; font-size: 13px; font-weight: 500;">No presets saved yet.</div>`;
    } else {
        listHTML = `<div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px;">`;
        keys.forEach(k => {
            const p = data[k];
            const avatarBg = p.avatarBase64 || "https://cdn.discordapp.com/embed/avatars/0.png";
            const bannerBg = p.bannerBase64 || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
            
            const isSelected = currentSelectedPreset === k;
            const borderStyle = isSelected ? "border: 2px solid #5865f2;" : "border: 2px solid rgba(255,255,255,0.2);";

            listHTML += `
                <div class="lp-preset-card" data-name="${k}" style="position: relative; width: 64px; height: 64px; border-radius: 8px; overflow: hidden; cursor: pointer; ${borderStyle} transition: all 0.2s ease;" title="${k}">
                    <img src="${bannerBg}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.5; position: absolute; top: 0; left: 0; z-index: 1;" />
                    <img src="${avatarBg}" style="width: 34px; height: 34px; border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); border: 2px solid rgba(0,0,0,0.5); z-index: 2; object-fit: cover;" />
                </div>
            `;
        });
        listHTML += `</div>`;
    }

    let actionPanelHTML = "";
    if (currentSelectedPreset && data[currentSelectedPreset]) {
        actionPanelHTML = `
            <div style="background: rgba(0,0,0,0.4); border-radius: 8px; padding: 10px; border: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 8px;">
                <div style="font-weight: 700; font-size: 13px; color: #f2f3f5;">Selected: <span style="color: #5865f2;">${currentSelectedPreset}</span></div>
                <div style="display: flex; gap: 8px;">
                    <button id="lp-btn-apply" style="flex: 1; padding: 6px; border-radius: 4px; background: #248046; color: #fff; border: none; font-size: 12px; font-weight: 600; cursor: pointer; transition: opacity 0.2s;">Apply</button>
                    <button id="lp-btn-delete" style="flex: 1; padding: 6px; border-radius: 4px; background: #da373c; color: #fff; border: none; font-size: 12px; font-weight: 600; cursor: pointer; transition: opacity 0.2s;">Delete</button>
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <div style="margin-bottom: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
            <h3 style="color: #f2f3f5; font-size: 12px; font-weight: 800; text-transform: uppercase; margin-bottom: 8px;">Profile Presets</h3>
            ${listHTML}
            ${actionPanelHTML}
            
            <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 12px;">
                <input id="lp-new-name" placeholder="Name to save current profile..." style="width: 100%; padding: 8px 10px; border-radius: 4px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); color: #ffffff; font-size: 13px; outline: none; box-sizing: border-box;" />
                <button id="lp-btn-save" style="width: 100%; padding: 8px; border-radius: 4px; background: #5865f2; color: #fff; border: none; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.2s;">Save Current Profile</button>
            </div>
            <div id="lp-status" style="margin-top: 8px; font-size: 12px; font-weight: 600; color: #b5bac1; text-align: center;"></div>
        </div>
    `;

    const statusEl = container.querySelector("#lp-status") as HTMLElement;
    const nameInput = container.querySelector("#lp-new-name") as HTMLInputElement;

    container.querySelectorAll(".lp-preset-card").forEach(card => {
        (card as HTMLElement).onclick = () => {
            currentSelectedPreset = card.getAttribute("data-name");
            renderPresetsUI(container);
        };
    });

    const saveBtn = container.querySelector("#lp-btn-save") as HTMLButtonElement;
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const val = nameInput.value.trim().toLowerCase();
            if (!val) {
                statusEl.style.color = "#fa777c";
                statusEl.innerText = "Please enter a name first.";
                return;
            }

            saveBtn.disabled = true;
            statusEl.style.color = "#f2f3f5";
            statusEl.innerText = "Reading current profile data...";

            try {
                const me = UserStore.getCurrentUser();
                if (!me) throw new Error("Could not fetch User ID");

                let userProfile = {};
                let userObj = {};

                try {
                    const profileRes = await RestAPI.get({ url: `/users/${me.id}/profile` });
                    userProfile = profileRes.body?.user_profile || {};
                    userObj = profileRes.body?.user || {};
                } catch (e) {
                    console.warn("API GET failed, falling back to basic data.");
                }

                const newPreset: ProfilePreset = {
                    bio: (userProfile as any).bio || "",
                    themeColors: (userProfile as any).theme_colors || null,
                    profileEffectId: (userProfile as any).profile_effect_id || null,
                    avatarBase64: null,
                    bannerBase64: null
                };

                const avatarHash = (userObj as any).avatar || me.avatar;
                if (avatarHash) {
                    const ext = avatarHash.startsWith("a_") ? "gif" : "png";
                    const url = `https://cdn.discordapp.com/avatars/${me.id}/${avatarHash}.${ext}?size=512`;
                    newPreset.avatarBase64 = await fetchImageAsBase64(url, ext);
                }

                const bannerHash = (userObj as any).banner || me.banner;
                if (bannerHash) {
                    const ext = bannerHash.startsWith("a_") ? "gif" : "png";
                    const url = `https://cdn.discordapp.com/banners/${me.id}/${bannerHash}.${ext}?size=1024`;
                    newPreset.bannerBase64 = await fetchImageAsBase64(url, ext);
                }

                const currentData = (await DataStore.get(STORAGE_KEY)) || {};
                currentData[val] = newPreset;
                await DataStore.set(STORAGE_KEY, currentData);
                
                currentSelectedPreset = val;
                await renderPresetsUI(container);
            } catch (err: any) {
                statusEl.style.color = "#fa777c";
                statusEl.innerText = `Save Error: ${err.message || err}`;
                saveBtn.disabled = false;
            }
        };
    }

    const applyBtn = container.querySelector("#lp-btn-apply") as HTMLButtonElement;
    if (applyBtn && currentSelectedPreset) {
        applyBtn.onclick = async () => {
            applyBtn.disabled = true;
            statusEl.style.color = "#f2f3f5";
            statusEl.innerText = `Applying ${currentSelectedPreset}...`;
            
            try {
                const currentData = (await DataStore.get(STORAGE_KEY)) || {};
                const target = currentData[currentSelectedPreset!];
                if (!target) throw new Error("Preset data missing.");

                // Adım 1: Avatar ve Banner'ı @me endpoint'ine yolla
                const userPayload = {
                    avatar: target.avatarBase64 || null,
                    banner: target.bannerBase64 || null
                };

                const resMe = await RestAPI.patch({ url: "/users/@me", body: userPayload });
                if (resMe.status && resMe.status >= 400) {
                    // Discord 400 hata kodunu verirse mesajı yakala
                    throw new Error(`Avatar/Banner API: ${resMe.body?.message || resMe.status}`);
                }

                // Adım 2: Bio, Renkler ve Efekti @me/profile endpoint'ine yolla
                const profilePayload: any = { bio: target.bio || "" };
                if (target.themeColors !== undefined) profilePayload.theme_colors = target.themeColors;
                if (target.profileEffectId !== undefined) profilePayload.profile_effect_id = target.profileEffectId;

                const resProfile = await RestAPI.patch({ url: "/users/@me/profile", body: profilePayload });
                if (resProfile.status && resProfile.status >= 400) {
                    throw new Error(`Bio/Colors API: ${resProfile.body?.message || resProfile.status}`);
                }

                statusEl.style.color = "#43b581";
                statusEl.innerText = `Successfully applied! Reloading...`;
                
                setTimeout(() => {
                    window.location.reload();
                }, 800);

            } catch (err: any) {
                statusEl.style.color = "#fa777c";
                // Discord'un net olarak döndürdüğü string hata mesajı burada görünecek
                statusEl.innerText = `${err.message || "Unknown Application Error"}`;
                applyBtn.disabled = false;
            }
        };
    }

    const delBtn = container.querySelector("#lp-btn-delete") as HTMLButtonElement;
    if (delBtn && currentSelectedPreset) {
        delBtn.onclick = async () => {
            const currentData = (await DataStore.get(STORAGE_KEY)) || {};
            delete currentData[currentSelectedPreset!];
            await DataStore.set(STORAGE_KEY, currentData);
            currentSelectedPreset = null;
            await renderPresetsUI(container);
        };
    }
}

export default definePlugin({
    name: "ProfilePresets",
    description: "Saves everything and enforces exact Discord API payloads with detailed error catching.",
    authors: [
        {
            name: "Luciano Ferretti (xLegendirer)",
            id: 832617684285915226n
        }
    ],

    start() {
        observer = new MutationObserver(() => {
            if (document.getElementById("luciano-presets-wrapper")) return;

            const elements = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, div"));
            const targetHeader = elements.find(el => {
                const t = el.textContent?.toLowerCase().trim() || "";
                return t === "profil efekti ve çerçeveler" || t.includes("profile effect");
            });

            if (!targetHeader) return;

            let targetCol = targetHeader.parentElement;
            let safetyCount = 0;
            
            while (targetCol && targetCol.children.length < 3 && safetyCount < 10) {
                targetCol = targetCol.parentElement;
                if (targetCol === document.body) return;
                safetyCount++;
            }
            
            if (targetCol && !document.getElementById("luciano-presets-wrapper")) {
                const wrapper = document.createElement("div");
                wrapper.id = "luciano-presets-wrapper";
                wrapper.style.cssText = "width: 100%; box-sizing: border-box;";
                targetCol.appendChild(wrapper);
                renderPresetsUI(wrapper);
            }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
    },

    stop() {
        if (observer) observer.disconnect();
        document.getElementById("luciano-presets-wrapper")?.remove();
        currentSelectedPreset = null;
    }
});
