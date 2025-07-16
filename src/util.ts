import { fnv0 } from 'libvantage';

export function hashDvar(dvar: string): string {
    if (dvar.startsWith('0x')) {
        return dvar;
    }
    return '0x' + fnv0(dvar.toLowerCase() + '\0', 0x319712C3, 0xB3CB2E29).toString(16).toUpperCase();
}