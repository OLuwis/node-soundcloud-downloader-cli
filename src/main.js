const ffmpeg = require("@ffmpeg-installer/ffmpeg").path;
const childProcess = require("child_process");
const https = require("https");
const fs = require("fs");

const args = process.argv;
if (args.length > 2) {
    main(args[2].trim());
} else {
    console.log("No SoundCloud Track URL Provided");
};

async function main(url) {

    if (!url.includes("soundcloud.com")) {
        return console.log("Invalid SoundCloud Track URL Provided");
    } else {
        url = url.substring(url.indexOf("https")).trim();
    }

    const client_id = "trnMhwTI91yGR73E30PpagpyUvVBs52q";
    
    const soundcloud_response = await fetch(url);
    const html_string = await soundcloud_response.text();
    
    const json_string = html_string.substring(
        html_string.indexOf("n = [")+4,
        html_string.lastIndexOf("]")+1
    );

    const track_cover_url = html_string.substring(
        html_string.indexOf("img src=\"")+"img src=\"".length,
        html_string.indexOf("\" width")
    );
    
    const json = JSON.parse(json_string.trim());

    const track_title = json[7].data.title;
    const track_artist = json[7].data.user.username;
    const track_date = json[7].data.display_date.substring(0, 10);
    const track_transcoding_url = json[7].data.media.transcodings[0].url;
    const track_token = json[7].data.track_authorization;

    const stream_response = await fetch(`${track_transcoding_url}?client_id=${client_id}&track_authorization=${track_token}`);
    const track_stream = await stream_response.json();

    const track_name = `${track_artist} - ${track_title}`;

    await new Promise((resolve, reject) => {
        https.get(track_cover_url, res => {
            const stream = fs.createWriteStream(`${track_name}.jpg`);
            res.pipe(stream);
            res.on("close", () => {
                console.log("Download ArtWork");
                resolve();
            });
        });
    });

    const track_download = childProcess.spawnSync(
        ffmpeg,["-y", "-i", track_stream.url, "-i", `${track_name}.jpg`, "-metadata", `title=${track_title}`, "-metadata", `artist=${track_artist}`, "-metadata", `date=${track_date}`, "-codec", "copy", "-map", "0", "-map", "1", `${track_name}.mp3`]
    );

    if (track_download.status == 0) {
        console.log(`Finished downloading ${track_name}.mp3`);
    } else {
        console.log(`Error downloading ${track_name}.mp3`);
    };
    
    fs.unlinkSync(`${track_name}.jpg`);
};