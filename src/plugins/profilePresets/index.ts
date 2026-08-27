import { ApplicationCommandOptionType, registerCommand } from "@api/Commands";
import { DataStore } from "@api/DataStore";
import definePlugin from "@utils/types";
import { RestAPI } from "@webpack/common";

interface ProfilePreset {
    bio?: string;
    avatarBase64?: string;
    bannerBase64?: string;
}

const STORAGE_KEY = "ProfilePresets_data";

async function fetchImageAsBase64(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Görsel indirilemedi: ${res.statusText}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Görsel base64 formatına çevrilemedi."));
        reader.readAsDataURL(blob);
    });
}

export default definePlugin({
    name: "ProfilePresets",
    description: "Farklı profil şablonlarını kaydeder, dışarıdan ekler ve tek tıkla uygular.",
    authors: [{ name: "Luciano", id: 0n }],

    start() {
        // 1. Dışarıdan veya manuel profil kaydetme komutu
        registerCommand({
            name: "preset-save",
            description: "Yeni bir profil şablonu kaydeder.",
            options: [
                {
                    name: "name",
                    description: "Profilin kayıt ismi (örn: anime, sade)",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                },
                {
                    name: "bio",
                    description: "Hakkımda metni",
                    type: ApplicationCommandOptionType.STRING,
                    required: false
                },
                {
                    name: "avatar_url",
                    description: "Avatar görsel bağlantısı (URL)",
                    type: ApplicationCommandOptionType.STRING,
                    required: false
                },
                {
                    name: "banner_url",
                    description: "Banner görsel bağlantısı (URL)",
                    type: ApplicationCommandOptionType.STRING,
                    required: false
                }
            ],
            execute: async args => {
                const presetName = args.name.toLowerCase().trim();
                const newPreset: ProfilePreset = {
                    bio: args.bio
                };

                try {
                    if (args.avatar_url) {
                        newPreset.avatarBase64 = await fetchImageAsBase64(args.avatar_url);
                    }
                    if (args.banner_url) {
                        newPreset.bannerBase64 = await fetchImageAsBase64(args.banner_url);
                    }

                    const presets = (await DataStore.get(STORAGE_KEY)) || {};
                    presets[presetName] = newPreset;
                    await DataStore.set(STORAGE_KEY, presets);

                    return { content: `✅ **${presetName}** profili başarıyla kaydedildi!` };
                } catch (err: any) {
                    return { content: `❌ Profil kaydedilirken hata oluştu: ${err.message || err}` };
                }
            }
        });

        // 2. Kayıtlı profili hesaba uygulama komutu
        registerCommand({
            name: "preset-apply",
            description: "Kayıtlı bir profil şablonunu hesabına uygular.",
            options: [
                {
                    name: "name",
                    description: "Uygulanacak profilin ismi",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            execute: async args => {
                const presetName = args.name.toLowerCase().trim();
                const presets = (await DataStore.get(STORAGE_KEY)) || {};
                const targetPreset: ProfilePreset = presets[presetName];

                if (!targetPreset) {
                    return { content: `❌ **${presetName}** adında kayıtlı bir profil bulunamadı.` };
                }

                try {
                    await RestAPI.patch({
                        url: "/users/@me/profile",
                        body: {
                            bio: targetPreset.bio,
                            avatar: targetPreset.avatarBase64,
                            banner: targetPreset.bannerBase64
                        }
                    });
                    return { content: `🚀 **${presetName}** profili başarıyla uygulandı!` };
                } catch (err: any) {
                    return { content: `⚠️ Profil uygulanırken Discord API hatası oluştu: ${err.message || err}` };
                }
            }
        });

        // 3. Kayıtlı profilleri listeleme komutu
        registerCommand({
            name: "preset-list",
            description: "Kayıtlı tüm profil şablonlarını listeler.",
            execute: async () => {
                const presets = (await DataStore.get(STORAGE_KEY)) || {};
                const keys = Object.keys(presets);

                if (keys.length === 0) {
                    return { content: "Kayıtlı hiçbir profil bulunamadı. `/preset-save` ile ekleyebilirsin." };
                }

                return { content: `📋 **Kayıtlı Profiller:**\n${keys.map(k => `• \`${k}\``).join("\n")}` };
            }
        });
    }
});
