import { Stream } from 'libvantage';
import { hashDvar } from './util';

export type DvarMap = {
    [dvar: string]: string;
};

function readStringBlock(count: number, io: Stream): string[] {
    const strings = [];
    while (count-- > 0) {
        const stringLen = io.readInt16();
        if (stringLen !== 0 && stringLen < 0x400) {
            strings.push(io.readString('ascii', stringLen));
        } else {
            strings.push('');
        }
    }
    return strings;
}

function writeStringBlock(io: Stream, stringList: string[]): void {
    for (const string of stringList) {
        io.writeInt16(string.length);
        io.writeString(string);
    }
}

function readDvarBlock(io: Stream): DvarMap {
    const dvars = {};
    let dvarLength: number;
    while ((dvarLength = io.readInt32()) !== -1) {
        const dvar = io.readString('ascii', dvarLength);
        dvars[dvar] = io.readString('ascii', io.readInt32());
    }
    return dvars;
}

const healthDvar = hashDvar('g_player_maxHealth');

function writeDvarBlock(io: Stream, dvars: DvarMap): void {
    Object.getOwnPropertyNames(dvars).filter(dvar => !dvar.startsWith('__') && typeof dvars[dvar] !== 'undefined').forEach(key => io
        .writeInt32(key.length)
        .writeString(key)
        .writeInt32(dvars[key].length)
        .writeString(dvars[key]));
    io.writeInt32(-1);
}

export class Segment2 {
    public readonly models1: string[];
    public readonly models2: string[];
    public readonly effects1: string[];
    public readonly effects2: string[];
    public readonly audio1: string[];
    public readonly audio2: string[];
    public readonly text1: string[];
    public readonly uList1: string[];
    public readonly uList2: string[];
    public dvars: DvarMap;

    private header: Buffer;
    private postDvars1: Buffer;
    private postDvars2: Buffer;
    private footer: Buffer;
    private u1: number;
    private u2: number;
    private u3: number;
    private u4: number;
    private u5: number;
    private health: number;

    constructor(buffer: Buffer) {
        const io = new Stream(buffer);
        this.header = io.readBytes(0xD0);
        this.models1 = readStringBlock(0x400, io);
        this.models2 = readStringBlock(0x40, io);
        this.effects1 = readStringBlock(0x200, io);
        this.effects2 = readStringBlock(0x200, io);
        this.audio1 = readStringBlock(0x200, io);
        this.audio2 = readStringBlock(0x80, io);
        this.text1 = readStringBlock(0x95f, io);
        this.uList1 = readStringBlock(0x02, io);
        this.uList2 = readStringBlock(0x0d, io);
        this.dvars = readDvarBlock(io);
        this.postDvars1 = io.readBytes(0xD000);
        this.u1 = io.readInt32();
        this.postDvars2 = io.readBytes(this.u1 << 3);
        this.u2 = io.readInt32();
        this.u3 = io.readInt32();
        this.u4 = io.readInt32();
        this.u5 = io.readInt32();
        this.health = io.readInt32();
        this.footer = io.readBytes(io.length - io.position);
    }

    public importDvars(dvars: DvarMap): void {
        this.dvars = dvars;
    }

    public toBuffer(): Buffer {
        const io = Stream.reserve(0x400000);
        io.writeBytes(this.header);
        writeStringBlock(io, this.models1);
        writeStringBlock(io, this.models2);
        writeStringBlock(io, this.effects1);
        writeStringBlock(io, this.effects2);
        writeStringBlock(io, this.audio1);
        writeStringBlock(io, this.audio2);
        writeStringBlock(io, this.text1);
        writeStringBlock(io, this.uList1);
        writeStringBlock(io, this.uList2);
        writeDvarBlock(io, this.dvars);
        io.writeBytes(this.postDvars1);
        io.writeUInt32(this.u1);
        io.writeBytes(this.postDvars2);
        io.writeUInt32(this.u2);
        io.writeUInt32(this.u3);
        io.writeUInt32(this.u4);
        io.writeUInt32(this.u5);
        io.writeInt32(+(this.dvars.hasOwnProperty(healthDvar) ? this.dvars[healthDvar] : this.health));
        io.writeBytes(this.footer);
        return io.getBuffer();
    }
}