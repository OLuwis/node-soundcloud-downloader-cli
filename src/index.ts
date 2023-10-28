#!/usr/bin/env node

import { Command } from "commander";
import { SoundCloudPlaylist, SoundCloudTrack } from "./soundcloud.js";

const cli = new Command();

cli
    .name("SoundCloud Downloader Node")
    .description("A Node CLI to download SoundCloud tracks")
    .version("1.0.0")
    .addHelpCommand(false)

cli
    .command("t")
    .description("Downloads a single track")
    .argument("<url>")
    .action(async (url: string) => {
        if (url.includes("soundcloud.com")) {
            await new SoundCloudTrack(url).start();
        } else {
            console.log("Invalid SoundCloud Track URL");
        }
    });

cli
    .command("p")
    .description("Downloads a full playlist")
    .argument("<url>")
    .action(async (url: string) => {
        if (url.includes("soundcloud.com") && url.includes("/sets/")) {
            await new SoundCloudPlaylist(url).start();
        } else {
            console.log("Invalid SoundCloud Playlist URL");
        }
    });
    
cli.parse();