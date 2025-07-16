import { SaveEditor, Stream } from 'libvantage';
import { CampaignSave } from './campaign-save';
import { Segment2 } from './segment2';
import { hashDvar } from './util';
import dvars from './dvars';

// These are all the dvars the components
// will be editing. We need their hashes.
const hashes = {};
[
    'player_sustainAmmo',
    'g_speed',
    'jump_height',
    'player_sprintUnlimited',
    'player_sprintSpeedScale',
    'player_clipSizeMultiplier',
    'g_gravity',
].forEach(dvar => hashes[dvar] = hashDvar(dvar));

const godModeValues = {
    player_swimDamage: '0',
    player_deathInvulnerableTime: '1000',
    player_damageMultiplier: '0',
    player_meleeDamageMultiplier: '0',
    bg_fallDamageMaxHeight: '1000',
    bg_fallDamageMinHeight: '1000',
    g_player_maxhealth: '1000',
    player_deathInvulnerableToMelee: '1',
    player_deathInvulnerableToProjectile: '1',
};

export class Editor implements SaveEditor {
    private campaignSave: CampaignSave;
    private seg2: Segment2 = <any>{
        dvars: {},
    };
    private hashes = hashes;
    private godModeEnabled: boolean;
    
    public load(buffer: Buffer): void {
        this.godModeEnabled = false;
        this.campaignSave = new CampaignSave(new Stream(buffer));
        this.seg2 = new Segment2(this.campaignSave.getSegment(2));
    }

    public enableGodMode(): void {
        this.godModeEnabled = true;
        Object.getOwnPropertyNames(godModeValues).forEach(dvar => this.setDvar(dvar, godModeValues[dvar]));
        alert('God mode enabled! To disable it, continue to the next checkpoint and save your game.');
    }

    public async backupDvars(): Promise<void> {
        const filename = await saveFileDialog({
            defaultPath: "dvars",
            filters: [{
                name: 'DVAR Files',
			    extensions: ['json'],
            }],
        });
        if (filename) {
            await writeFile(filename, JSON.stringify(this.seg2.dvars, undefined, 2));
        }
    }

    public async restoreDvars(): Promise<void> {
        const filenames = await openFileDialog({
            filters: [{
                name: 'DVAR Files',
			    extensions: ['json'],
            }],
        });
        if (filenames && filenames[0]) {
            try {
                this.seg2.importDvars(JSON.parse(await readFile(filenames[0], 'utf8')));
            } catch (e) {
                alert('Failed to import DVAR file.');
            }
        }
    }

    public save(): Buffer {
        return this.campaignSave
            .setSegment(2, this.seg2.toBuffer())
            .toBuffer();
    }

    public setDvar(dvar: string, value: string): void {
        const hash = hashDvar(dvar);
        // We want to preserve the casing of
        // dvars already in the cache.
        if (!reverseDvarCache.has(hash)) {
            reverseDvarCache.set(hash, dvar);
        }
        this.seg2.dvars[hash] = value;
    }
}

// Keep a map of hash -> dvar so we can show
// the actual dvar names instead of a hash.
const reverseDvarCache = new Map<string, string>();
for (const dvar of dvars) {
    reverseDvarCache.set(hashDvar(dvar), dvar);
}

export class RealDvarNameValueConverter {
    public toView(hash: string): string {
        return reverseDvarCache.get(hash) || hash;
    }
}

export class BoolDvarValueConverter {
    public toView(value: string): boolean {
        return value && value !== '0';
    }

    public fromView(value: boolean): string {
        return value ? '1' : '0';
    }
}

export class IntDvarValueConverter {
    public toView(value: string): number {
        return parseInt(value);
    }

    public fromView(value: number): string {
        return Number.isNaN(value) ? undefined : value.toString();
    }
}

export class FloatDvarValueConverter {
    public toView(value: string): number {
        return parseFloat(value);
    }

    public fromView(value: number): string {
        return Number.isNaN(value) ? undefined : value.toString();
    }
}

export class FilterDvarValueConverter {
    public toView(dvar: {hash: string, name: string}, dvars: object, filter?: string): boolean {
        if (filter && dvar.name && dvar.name.toLowerCase() === filter.toLowerCase()) {
            return true;
        }
        if (typeof dvars[dvar.hash] === 'undefined') {
            return false;
        }
        if (!filter || !(filter = filter.trim())) {
            return !!dvar.name;
        }
        // Exact hash value.
        if (dvar.hash === filter) {
            return true;
        }
        return dvar.name && dvar.name.includes(filter);
    }
}

export class DvarsValueConverter {
    public toView(hashes: string[], extra?: string): {hash: string, name: string}[] {
        const dvars = hashes.map(hash => ({
            hash,
            name: reverseDvarCache.get(hash),
        })).sort((a, b) => (a.name || a.hash).localeCompare(b.name || b.hash))
        if (extra) {
            let hash: string;
            if (extra.startsWith('0')) {
                hash = extra;
                if (reverseDvarCache.has(hash)) {
                    extra = reverseDvarCache.get(hash);
                }
            } else {
                hash = hashDvar(extra);
                if (reverseDvarCache.has(hash)) {
                    extra = reverseDvarCache.get(hash);
                } else {
                    reverseDvarCache.set(hash, extra);
                }
            }
            const existing = dvars.findIndex(d => d.hash === hash);
            if (existing !== -1) {
                const dvar = dvars[existing];
                dvars.splice(existing, 1);
                dvars.unshift(dvar);
            } else {
                dvars.unshift({
                    hash: hash,
                    name: extra,
                });
            }
        }
        return dvars;
    }
}