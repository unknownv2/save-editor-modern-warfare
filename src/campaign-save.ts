import { Stream } from 'libvantage';

const checksumAddress = 0x08;
const dataLengthAddress = 0x4CC;
const dataStartAddress = 0x500;
const segmentCount = 38;

export class CampaignSave {
    private header: Buffer;
    private segments: Buffer[] = [];

    constructor(io: Stream) {
        this.header = io.readBytes(dataStartAddress);

        io.position = dataLengthAddress;
        const dataSize = io.readUInt32();

        io.position = dataStartAddress;
        const data = io.readBytes(dataSize);

        io.position = checksumAddress;
        if (io.readUInt32() !== this.calculateChecksum(data)) {
            console.warn('Save data has been tampered with.');
        }

        io = new Stream(data);
        for (let x = 0; x < segmentCount; x++) {
            this.segments.push(io.readBytes(io.readUInt32() - 4));
        }
    }

    public getSegment(index: number): Buffer {
        return decompressBuffer(this.segments[index]);
    }

    public setSegment(index: number, data: Buffer): CampaignSave {
        this.segments[index] = compressBuffer(data);
        return this;
    }

    public toBuffer(): Buffer {
        const dataLength = this.segments.reduce((size, val) => size + val.length + 4, 0);
        const io = Stream.alloc(this.header.length + dataLength)
            .writeBytes(this.header)
            .seek(dataLengthAddress)
            .writeUInt32(dataLength)
            .seek(dataStartAddress);

        for (const segment of this.segments) {
            io.writeUInt32(segment.length + 4);
            io.writeBytes(segment);
        }

        io.seek(dataStartAddress);
        // This isn't inefficient because readBytes returns a slice of the buffer.
        const checksum = this.calculateChecksum(io.readBytes(dataLength));
        io.seek(checksumAddress);
        io.writeUInt32(checksum);
        return io.getBuffer();
    }

    private calculateChecksum(data: Buffer): number {
        let checksum = 1;
        let len = data.length;
        let off = 0;
        let s1 = checksum & 0xFFFF;
        let s2 = checksum >> 16;
        while (len > 0) {
            var n: number = 3800;
            if (n > len) {
                n = len;
            }
            len -= n;
            while (--n >= 0) {
                s1 = s1 + (data[off++] & 0xFF);
                s2 = s2 + s1;
            }
            s1 %= 65521;
            s2 %= 65521;
        }
        return ((s2 << 16) | s1) >>> 0;
    }
}

function decompressBuffer(buffer: Buffer): Buffer {
    const io = new Stream(buffer);
    io.readByte();
    var stream = Stream.reserve(0x10000);
    var counter: number = 0, szSegment = <number>io.length, zeros = 0, copied = 0;
    do {
        if (counter != 0) {
            do {
                counter--;
                if (io.position >= szSegment) {
                    break;
                }
                stream.writeByte(io.readByte());
            }
            while (counter != 0);
            copied = zeros;
        }
        while (copied != 0) {
            copied--;
            stream.writeByte(0);
            zeros = copied;
        }
        if (io.position >= szSegment) {
            break;
        }
        var val: number = io.readByte();
        if ((val & 0xC0) == 0) {
            counter = (val & 0x3F) + 1;
            copied = 0;
        }
        else {
            copied = (val & 0x3F) + 1;
            counter = (val >> 6);
        }
        zeros = copied;
    }
    while (true);

    return stream.getBuffer();
}

function compressBuffer(buffer: Buffer): Buffer {
    var SegmentReader = new Stream(buffer);
    var io = Stream.alloc(0x10000);
    var zeros = 0, g_compCount = 0, g_cacheBufferLen = -1, g_cacheSize = 1, g_cacheWriteLen = SegmentReader.length,
        read = 0, g_writeIdx = 0, tval = 0;

    var incBufLen = true;
    do {
        if (g_compCount == 0) {
            do {
                tval = SegmentReader.readByte();
                if (g_cacheBufferLen == 0x3F) {
                    io.seek(g_writeIdx);
                    io.writeByte(0x3F);
                    g_writeIdx += g_cacheSize;
                    if ((g_writeIdx + 0x41) > 0x1C0000) {
                        console.log("invalid cache size detected.");
                    }

                    io.seek(g_writeIdx + 1);
                    io.writeByte(tval);
                    g_cacheBufferLen = 0;
                    g_compCount = 0;
                    g_cacheSize = 2;
                    zeros = (tval == 0) ? 1 : 0;
                }
                else {
                    if (tval != 0) {
                        zeros = 0;
                    }
                    else {
                        zeros++;
                        if (g_cacheBufferLen <= 2 && g_cacheBufferLen >= 0) {
                            g_compCount = (g_cacheBufferLen + 1);

                            break;
                        }
                        else if (g_cacheBufferLen > 2 && zeros >= 3) {
                            var cidx: number = g_cacheBufferLen + 0xFD;
                            g_cacheSize -= 3;
                            io.seek(g_writeIdx + g_cacheSize);
                            tval = io.readByte();
                            io.seek(g_writeIdx);
                            io.writeByte(cidx);
                            g_writeIdx += (g_cacheSize);
                            if ((g_writeIdx + 0x41) > 0x1C0000) {
                                console.log("invalid cache size detected.");
                            }

                            g_compCount = 1;
                            zeros = 0;

                            io.seek(g_writeIdx + 1);
                            io.writeByte(tval);

                            g_cacheBufferLen = 2;
                            g_cacheSize = 2;

                            incBufLen = false;
                            break;
                        }
                    }
                    io.seek(g_writeIdx + g_cacheSize);
                    io.writeByte(tval);
                    g_cacheBufferLen++;
                    g_cacheSize++;
                }
            } while (++read < g_cacheWriteLen);
            if (incBufLen && read >= g_cacheWriteLen)
                break;
        }
        else {
            do {
                tval = SegmentReader.readByte();
                if (tval != 0) {
                    zeros = 0;

                    break;
                }
                else {
                    zeros++;
                    if (g_cacheBufferLen == 0x3F) {
                        zeros = 1;

                        break;
                    }
                    else {
                        g_cacheBufferLen++;
                    }
                }
            } while (++read < g_cacheWriteLen);
            if (read >= g_cacheWriteLen) {
                break;
            }

            g_cacheBufferLen += ((g_compCount << 6) & 0xFFFFFFFF) >>> 0;

            io.seek(g_writeIdx);
            io.writeByte(g_cacheBufferLen);
            g_writeIdx += (g_cacheSize);

            if ((g_writeIdx + 0x41) > 0x1C0000) {
                console.log("invalid cache size detected.");
            }

            io.seek(g_writeIdx + 1);
            io.writeByte(tval);

            g_compCount = 0;
            g_cacheSize = 2;
        }
        if (incBufLen) {
            g_cacheBufferLen = 0;
        }
        else {
            incBufLen = true;
        }
        read++;
    } while (read < g_cacheWriteLen);
    var final_idx: number = io.position;
    if (g_cacheSize > 1) {
        g_cacheBufferLen += (g_compCount << 6);
        io.seek(g_writeIdx);
        io.writeByte(g_cacheBufferLen);
        g_writeIdx += (g_cacheSize);
    }
    if ((g_writeIdx + 0x41) > 0x1C0000) {
        console.log("invalid cache size detected.");
    }

    if (final_idx != g_writeIdx) {
        console.log("invalid cache size detected.");
    }
    io.seek(0x00);
    var buf: Buffer = io.readBytes(g_writeIdx);
    var saveIo = Stream.alloc(buf.length + 1);

    saveIo.seek(0x00);
    saveIo.writeByte(0x01);
    saveIo.writeBytes(buf);

    saveIo.seek(0x00);
    var bfs = saveIo.readBytes(g_writeIdx + 1);

    return bfs;
}