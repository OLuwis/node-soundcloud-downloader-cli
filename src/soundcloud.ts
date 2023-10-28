import { mkdir, writeFile } from "fs/promises";
import { load } from "cheerio/lib/slim";
import { chdir } from "process";
import NodeID3 from "node-id3";
import fastq from "fastq";
import { cpus } from "os";

export class SoundCloudTrack {
    private url: string;
    private declare track: Track;
    private declare filename: string;
    private client_id: string | undefined;

    constructor(url: string, client_id?: string) {
        this.url = url;
        this.client_id = client_id;
    }

    public async start() {
        await this.extract();
        await this.download();
        await this.process();
    }

    private async extract() {
        const html = await fetch(this.url).then(page => page.text());

        const $ = load(html, null, false);

        const img_src = $("img").attr("src");
        const script = $("script:contains(\"window.__sc_hydration\")").html();
        const track = JSON.parse(<string> script?.substring(23, script?.length - 1))[7].data;

        const title: string = track.title;
        const artist: string = track.user.username;
        const year: string = track.created_at;
        const hls_url: string = track.media.transcodings[0].url;
        const track_authorization: string = track.track_authorization;

        console.time(`Downloaded track ${title} by ${artist} in`);
        
        this.track = {
            title: title,
            artist: artist,
            year: year,
            artwork_url: <string> img_src,
            hls_url: hls_url,
            track_authorization: track_authorization
        }

        this.filename = `${this.track.artist
                .replaceAll("\u005C", "\u29F5")
                .replaceAll("\u002F", "\u2CC6")
                .replaceAll("\u003C", "\u1438")
                .replaceAll("\u003E", "\u1433")
                .replaceAll("\u003A", "\u0589")
                .replaceAll("\u0022", "\u0027\u0027")
                .replaceAll("\u007C", "\u006C")
                .replaceAll("\u003F", "\uFF1F")
                .replaceAll("\u002A", "\u2217")
            } - ${this.track.title
                .replaceAll("\u005C", "\u29F5")
                .replaceAll("\u002F", "\u2CC6")
                .replaceAll("\u003C", "\u1438")
                .replaceAll("\u003E", "\u1433")
                .replaceAll("\u003A", "\u0589")
                .replaceAll("\u0022", "\u0027\u0027")
                .replaceAll("\u007C", "\u006C")
                .replaceAll("\u003F", "\uFF1F")
                .replaceAll("\u002A", "\u2217")
            }`;

        if (!this.client_id) {
            const script_url = $("script").map((i, el) => {
                if ($(el).attr("src")?.includes("https://a-v2.sndcdn.com/assets/3")) {
                    return el;
                }
            }).attr("src");
    
            const json = await fetch(<string> script_url).then(res => res.text());
    
            this.client_id = json.substring(
                json.indexOf("client_id=") + "client_id=".length,
                json.indexOf("\"", json.indexOf("client_id"))
            );
        }
    }

    private async download() {
        const hls_url = `${this.track.hls_url}?client_id=${this.client_id}&track_authorization=${this.track.track_authorization}`;

        const m3u8_url = JSON.parse(
            await fetch(hls_url)
                .then(res => res.text())
        ).url;

        const links: string[] = [];

        await fetch(m3u8_url)
            .then(res => res.text())
            .then(string => {
                string.split(/\r?\n/).forEach(line => {
                    if (!line.startsWith("#")) {
                        links.push(line);
                    }
                });
            });

        const buffers: Buffer[] = [];

        for (let start = 0; start < links.length; start++) {
            await fetch(links[start])
                .then(res => res.arrayBuffer())
                .then(arrBuffer => buffers.push(Buffer.from(arrBuffer)))
        }

        const blob = new Blob(buffers, { type: "audio/mpeg" });

        const buffer = Buffer.from(await blob.arrayBuffer());

        await writeFile(`${this.filename}.mp3`, buffer);
    }

    private async process() {
        const blob = await fetch(this.track.artwork_url).then(res => res.blob());

        const cover = {
            mime: blob.type,
            type: {
                id: 0
            },
            description: "Cover",
            imageBuffer: Buffer.from(await blob.arrayBuffer())
        }

        const tags: NodeID3.Tags = {
            title: this.track.title,
            artist: this.track.artist,
            year: this.track.year.substring(0, 4),
            image: cover
        }

        const success = NodeID3.write(tags, `${this.filename}.mp3`);

        if (success) {
            console.timeEnd(`Downloaded track ${this.track.title} by ${this.track.artist} in`);
        }
    }

}

interface Track {
    title: string
    artist: string
    year: string
    hls_url: string
    artwork_url: string
    track_authorization: string
}

export class SoundCloudPlaylist {
    private url: string;
    private base_url: string = "https://api-v2.soundcloud.com/tracks?ids=";
    private clone_url: string = this.base_url;
    private declare client_id: string;
    private declare playlist: Playlist;
    private id_count: number = 0;

    constructor(url: string) {
        this.url = url;
    }

    public async start() {
        await this.extract();
        await this.download();
    }

    private async extract() {
        const page = await fetch(this.url)
            .then(res => res.text());

        const data = JSON.parse(page.substring(
            page.indexOf("[{\"h"),
            page.indexOf(";</s", page.indexOf("[{\"h")))
        ).splice(7)[0].data;

        const url = page.substring(
            page.indexOf("https://a-v2.sndcdn.com/assets/3"),
            page.indexOf("\"", page.indexOf("https://a-v2.sndcdn.com/assets/3"))
        );

        const json = await fetch(url).then(res => res.text());

        this.client_id = json.substring(
            json.indexOf("client_id=") + "client_id=".length,
            json.indexOf("\"", json.indexOf("client_id"))
        );

        const title: string = data.title
        const track_count: number = data.track_count;
        const tracks = [];

        console.time(`Downloaded Playlist ${title} in`);

        for (let i = 0; i < 5; i++) {
            tracks.push(data.tracks[i]);
        }

        console.log(`Extracting 5 of ${track_count} tracks in ${title} playlist ...`)

        for (let i = 5; i < track_count; i++) {
            if (this.id_count === 50 || i + 1 === track_count - 1) {
                if (i + 1 === track_count - 1) {
                    console.log(`Extracting ${i + 2} out of ${track_count} tracks in ${title} playlist ...`)
                    this.clone_url += `${data.tracks[i + 1].id}%2C`;
                } else {
                    console.log(`Extracting ${i} out of ${track_count} tracks in ${title} playlist ...`)
                }
                this.clone_url = this.clone_url.substring(0, this.clone_url.length - 3) + `&client_id=${this.client_id}`;
                const playlist: any = await fetch(this.clone_url).then(res => res.json());
                for (let j = 0; j < playlist.length; j++) {
                    tracks.push(playlist[j]);
                }
                this.clone_url = this.base_url;
                this.id_count = 0;
            }
            this.clone_url += `${data.tracks[i].id}%2C`;
            this.id_count++;
        }

        const playlist: Playlist = {
            title: title,
            track_count: track_count,
            tracks: []
        }

        for (let i = 0; i < tracks.length; i++) {
            playlist.tracks.push({ id: i + 1, url: tracks[i].permalink_url });
        }

        this.playlist = playlist;
    }

    private async download() {
        const folder = this.playlist.title;
        
        const client_id = this.client_id;
        
        await mkdir(folder, { recursive: true });
        
        chdir(folder);

        const threads = cpus().length;

        const chunks: { id: number, url: string }[][] = [];
        
        const size = Math.round(this.playlist.track_count / threads);

        for (let i = 0; i < this.playlist.tracks.length; i += size) {
            const chunk = this.playlist.tracks.slice(i, i + size);
            chunks.push(chunk);
        }

        const queue = fastq.promise(download, threads);

        for (const chunk of chunks) {
            queue.push(chunk);
        }

        
        async function download(tracks: { id: number, url: string }[]) {
            for (const track of tracks) {
                await new SoundCloudTrack(track.url, client_id).start();
            }
        }

        await queue.drained().then(() => console.timeEnd(`Downloaded Playlist ${this.playlist.title} in`));
    }
}

interface Playlist {
    title: string;
    track_count: number
    tracks: { id: number, url: string }[]
}