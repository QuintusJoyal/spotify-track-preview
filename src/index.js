import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs-extra';
import getTrackData from './utils/getTrackData.js';
import axios from 'axios';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.post('/create-video', async (req, res) => {
  try {
    const downloadFile = async (url, outputPath) => {
      const response = await axios.get(url, { responseType: 'stream' });
      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);
      return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    };

    const track_id = req.body.track.split('track/')[1] || '';
    const preview = await getTrackData({ track_id });

    if (!preview) {
      return res.status(404).send('Track data not found');
    }

    await fs.ensureDir(path.join(__dirname, 'download'));
    await fs.ensureDir(path.join(__dirname, 'output'));

    const imageOutputPath = path.join(__dirname, 'download', `${preview.image.split('/image/')[1]}.jfif`);
    await downloadFile(preview.image, imageOutputPath);

    let audioOutputPath;
    if (preview.preview_url) {
      audioOutputPath = path.join(__dirname, 'download', `${preview.preview_url.split('?cid=')[1]}.mp3`);
      await downloadFile(preview.preview_url, audioOutputPath);
    }

    const outputVideo = path.join(__dirname, 'output', `output-${Date.now()}.mp4`);
    const command = ffmpeg().input(imageOutputPath).loop(30);

    if (audioOutputPath) {
      command.input(audioOutputPath).inputFormat('mp3').duration(30);
    }

    command.complexFilter([
      {
        filter: 'scale',
        options: {
          w: -1,
          h: 720,
        },
        inputs: '0:v',
        outputs: 'scaled_image'
      },
      {
        filter: 'zoompan',
        options: {
          z: '2',
          x: 'iw/4',
          y: 'ih/4',
          d: '900',
          s: '400x600',
        },
        inputs: 'scaled_image',
        outputs: 'zoomed_image'
      },
      {
        filter: 'boxblur',
        options: {
          lr: '10',
          lp: '10',
        },
        inputs: 'zoomed_image',
        outputs: 'blurred_bg'
      },
      {
        filter: 'colorchannelmixer',
        options: {
          rr: 0.35,
          gg: 0.35,
          bb: 0.35
        },
        inputs: 'blurred_bg',
        outputs: 'darkened_bg'
      },
      {
        filter: 'overlay',
        options: {
          x: '50',
          y: '100'
        },
        inputs: ['darkened_bg', '0:v'],
        outputs: 'image_overlay'
      },
      {
        filter: 'color',
        options: {
          c: 'black@0',
          s: '300x100'
        },
        outputs: 'box'
      },
      {
        filter: 'drawtext',
        options: {
          text: preview?.name,
          fontsize: 20,
          fontcolor: '#ffffff',
          x: 'if(gte(tw, 300), 0-n, 0)',
          y: '0',
          borderw: 2,
          bordercolor: 'black@0'
        },
        inputs: 'box',
        outputs: 'titled'
      },
      {
        filter: 'drawtext',
        options: {
          text: preview?.name,
          fontsize: 20,
          fontcolor: '#ffffff',
          x: 'if(gte(tw, 300), tw+50-n, w+50)',
          y: '0',
          borderw: 2,
          bordercolor: 'black@0'
        },
        inputs: 'titled',
        outputs: 'titled2'
      },
      {
        filter: 'drawtext',
        options: {
          text: preview?.name,
          fontsize: 20,
          fontcolor: '#ffffff',
          x: 'if(gte(tw, 300), tw*2+100-n, w*2+100)',
          y: '0',
          borderw: 2,
          bordercolor: 'black@0'
        },
        inputs: 'titled2',
        outputs: 'titled3'
      },
      {
        filter: 'drawtext',
        options: {
          text: preview?.artist,
          fontsize: 16,
          fontcolor: '#9a9a9a',
          x: 'if(gte(tw, 300), 0-n, 0)',
          y: '30',
          borderw: 2,
          bordercolor: 'black@0'
        },
        inputs: 'titled3',
        outputs: 'text_box'
      },
      {
        filter: 'drawtext',
        options: {
          text: preview?.artist,
          fontsize: 16,
          fontcolor: '#9a9a9a',
          x: 'if(gte(tw, 300), tw+50-n, w+50)',
          y: '30',
          borderw: 2,
          bordercolor: 'black@0'
        },
        inputs: 'text_box',
        outputs: 'text_box2'
      },
      {
        filter: 'drawtext',
        options: {
          text: preview?.artist,
          fontsize: 16,
          fontcolor: '#9a9a9a',
          x: 'if(gte(tw, 300), tw*2+100-n, w*2+100)',
          y: '30',
          borderw: 2,
          bordercolor: 'black@0'
        },
        inputs: 'text_box2',
        outputs: 'text_box3'
      },
      {
        filter: 'overlay',
        options: {
          x: '50',
          y: '450'
        },
        inputs: ['image_overlay', 'text_box3'],
        outputs: 'out'
      },
      ...(audioOutputPath
        ? [
            {
              filter: 'afade',
              options: { t: 'in', st: 0, d: 5 },
              inputs: '1:a',
              outputs: 'audio_fadein',
            },
            {
              filter: 'afade',
              options: { t: 'out', st: 25, d: 5 },
              inputs: 'audio_fadein',
              outputs: 'audio_fade',
            },
          ]
        : []),
    ]);

    command.outputOptions(['-map', '[out]']);
    if (audioOutputPath) {
      command.outputOptions(['-map', '[audio_fade]']);
    }

    command
      .save(outputVideo)
      .on('end', () => {
        res.download(outputVideo, (err) => {
          if (err) throw err;
          fs.unlinkSync(imageOutputPath);
          if (audioOutputPath) fs.unlinkSync(audioOutputPath);
          fs.unlinkSync(outputVideo);
        });
      })
      .on('error', (err) => {
        console.error(err);
        res.status(500).send('Error creating video');
      });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});