/// <reference path="./ennuizel.d.ts" />

const licenseInfo = `
Copyright (c) 2019-2021 Yahweasel
Copyright (c) 2022-present TechBS LLC.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
`;

const ui = Ennuizel.ui;
const hotkeys = Ennuizel.hotkeys;

// Our formats, as indexed in wizard options
const wizardFormats = ['_FLAC', '_M4A (MPEG-4 audio)', 'Ogg _Vorbis', '_Opus', 'wav_pack', '_wav', 'A_LAC (Apple Lossless)'];

// The plugin info
const plugin: ennuizel.Plugin = {
  name: 'Craig',
  id: 'craig',
  infoURL: 'https://github.com/CraigChat/ennuizel-craig-plugin',
  description: 'This plugin connects Ennuizel (the audio editing tool) to <a href="https://craig.chat/">Craig</a> (the online recording tool).',
  licenseInfo
};

const url = new URL(window.location.href);
const params = url.searchParams;

// Check whether to use the wizard
(function () {
  if (params.get('i')) plugin.wizard = wizard;
  plugin.postWizard = postWizard;
})();

// Register the plugin
Ennuizel.registerPlugin(plugin);

/**
 * The wizard.
 */
async function craigWizard(d: ennuizel.ui.Dialog, project: ennuizel.Project) {
  // Get project info
  const id = params.get('i');
  const key = params.get('k');
  const projName = params.get('nm') || String(id);
  const apiUrl = params.get('a') || 'craig.horse';
  const wizardOptsS = params.get('w');
  const wizardOpts = wizardOptsS ? Number.parseInt(wizardOptsS, 36) : null;

  // Hide it from the URL
  if (!project) {
    const hideURL = new URL(url);
    hideURL.search = '';
    window.history.pushState({}, 'Ennuizel — ' + projName, hideURL.toString());
    document.title = 'Ennuizel — ' + projName;
  }

  // Check for existing projects
  if (!project) {
    const projects = await Ennuizel.getProjects();
    const ecProjects: string[] = [];
    for (const project of projects) {
      if (/^craig-/.test(project.name)) ecProjects.push(project.id);
    }

    if (ecProjects.length) for (const id of ecProjects) await Ennuizel.deleteProjectById(id);
  }

  // Now ask them whether to wizard
  let doWizard = false;
  let doCancel = false;
  if (!wizardOptsS) {
    await ui.dialog(async function (d, show) {
      ui.mk('div', d.box, {
        innerHTML:
          'This tool is capable of automatically performing some mastering tasks on your audio and exporting it. Alternatively, you may use this tool manually to edit your audio.<br/><br/>'
      });

      const auto = hotkeys.btn(d, '_Automatic Mastering', { className: 'row' });
      const manual = hotkeys.btn(d, 'Manual _Editing', { className: 'row' });
      const canc = hotkeys.btn(d, '_Cancel', { className: 'row' });

      show(auto);

      await new Promise((res) => {
        auto.onclick = () => {
          doWizard = true;
          res(null);
        };
        manual.onclick = () => res(null);
        canc.onclick = () => {
          doCancel = true;
          res(null);
        };
      });
    });
  } else {
    doWizard = true;
  }

  if (doCancel) return;

  // If they chose the wizard, figure out what tasks to perform
  const opts = {
    format: '',
    mix: false,
    level: false,
    noiser: false,
    keep: false
  };
  if (doWizard) {
    if (!wizardOptsS || wizardOpts & 0x200) {
      await ui.dialog(async function (d, show) {
        // Format selection
        hotkeys.mk(d, '_Format:&nbsp;', (lbl) => ui.lbl(d.box, 'craig-format', lbl, { className: 'ez' }));
        const fsel = ui.mk('select', d.box, {
          id: 'craig-format'
        });
        for (const format of Ennuizel.standardExports) {
          ui.mk('option', fsel, {
            value: format.name,
            innerText: format.name.replace('_', '')
          });

          if (format.options.format === 'flac') {
            // Add the Audacity option here
            ui.mk('option', fsel, {
              value: 'aup',
              innerText: 'Audacity project'
            });
          }
        }
        ui.mk('br', d.box);
        ui.mk('br', d.box);

        // Options
        function mkOption(id: string, lbl: string) {
          const ret = ui.mk('input', d.box, {
            id: 'craig-' + id,
            type: 'checkbox'
          });
          hotkeys.mk(d, '&nbsp;' + lbl, (lbl) => ui.lbl(d.box, 'craig-' + id, lbl));
          ui.mk('br', d.box);
          return ret;
        }

        const mix = mkOption('mix', '_Mix into a single track');
        const level = mkOption('level', '_Level volume');
        level.checked = true;
        const noiser = mkOption('noiser', '_Noise reduction');
        const keep = mkOption('keep', '_Keep data cached in browser');
        ui.mk('br', d.box);

        const go = hotkeys.btn(d, '_Go', { className: 'row' });
        const canc = hotkeys.btn(d, '_Cancel', { className: 'row' });
        show(go);

        doWizard = await new Promise((res) => {
          go.onclick = () => {
            opts.format = fsel.value;
            opts.mix = mix.checked;
            opts.level = level.checked;
            opts.noiser = noiser.checked;
            opts.keep = keep.checked;
            res(true);
          };

          canc.onclick = () => res(false);
        });
      });
    } else {
      // Get the options from the URL
      opts.format = wizardFormats[wizardOpts & 0xf] || '_FLAC';
      opts.mix = !!(wizardOpts & 0x10);
      opts.level = !!(wizardOpts & 0x20);
      opts.noiser = !!(wizardOpts & 0x40);
      opts.keep = !!(wizardOpts & 0x100);
    }
  }

  if (!project) {
    // Import the actual data
    project = await loadData(d, url, id, key, projName, apiUrl);
  }

  // If they didn't want the wizard, we're now done
  if (!doWizard) return;

  d.box.innerHTML = 'Loading...';

  // Disable undo for all the wizard tasks
  await Ennuizel.disableUndo();

  const nr = Ennuizel.getPlugin('noise-repellent');
  const l = Ennuizel.getPlugin('better-normalization');

  // Make our pre-filter
  let preFilter: (x: ennuizel.EZStream<ennuizel.LibAVFrame>) => Promise<ReadableStream<ennuizel.LibAVFrame>> = null;
  if (opts.noiser || opts.level) {
    preFilter = async function (x) {
      let y: ReadableStream<ennuizel.LibAVFrame> = null;
      if (opts.noiser) y = await nr.api.noiseRepellent(x, { WHITENING: 50 });
      if (opts.level) y = await l.api.betterNormalize(y ? new Ennuizel.EZStream(y) : x);
      return y;
    };
  }

  // Mixing
  if (opts.mix) {
    // Maybe make our post-filter
    let postFilter: (x: ennuizel.EZStream<ennuizel.LibAVFrame>) => Promise<ReadableStream<ennuizel.LibAVFrame>> = null;
    if (opts.level) postFilter = l.api.betterNormalize;

    // Perform the mix
    Ennuizel.select.selectAll();
    const sel = Ennuizel.select.getSelection();
    await project.addTrack(await Ennuizel.filters.mixTracks(sel, d, { preFilter, postFilter }));

    // Get rid of the now-mixed tracks
    d.box.innerHTML = 'Loading...';
    for (const track of sel.tracks) await project.removeTrack(track);
  } else {
    // No mixing, just apply the filters we have
    if (preFilter) {
      Ennuizel.select.selectAll();
      const sel = Ennuizel.select.getSelection();
      await Ennuizel.filters.selectionFilter(preFilter, false, sel, d);
    }
  }

  // Export
  Ennuizel.select.selectAll();
  if (opts.format === 'aup') {
    // As Audacity
    await Ennuizel.exportAudacity(
      {
        prefix: projName,
        format: 'flac',
        codec: 'flac',
        ext: 'ogg',
        sampleFormat: Ennuizel.LibAVSampleFormat.S32
      },
      Ennuizel.select.getSelection(),
      d
    );
  } else {
    // Get the export options
    const exportt = Ennuizel.standardExports.filter((x) => x.name === opts.format)[0].options;

    // And export
    await Ennuizel.exportAudio(
      Object.assign(
        {
          prefix: projName
        },
        exportt
      ),
      Ennuizel.select.getSelection(),
      d
    );
  }

  await Ennuizel.exportCaption({ prefix: projName }, Ennuizel.select.getSelection(), d);

  d.box.innerHTML = 'Loading...';

  // Fetch the info.txt
  const ifr = document.createElement('iframe');
  ifr.style.display = 'none';
  ifr.src = `https://${apiUrl}/api/recording/${id}/.txt?key=${key}`;
  document.body.appendChild(ifr);

  // Delete it
  if (!opts.keep) await project.del();

  await ui.alert('Your audio has now been exported. You may close this tab, or click OK to continue using this tool.');
}

/**
 * The "regular" wizard.
 */
function wizard(d: ennuizel.ui.Dialog) {
  return craigWizard(d, null);
}

/**
 * The "post" wizard.
 */
async function postWizard(project: ennuizel.Project) {
  await Ennuizel.ui.loading(async function (d) {
    await craigWizard(d, project);
  });
}

/**
 * Load remote data.
 */
async function loadData(d: ennuizel.ui.Dialog, url: URL, id: string, key: string, projName: string, apiUrl: string) {
  // Make the project
  const project = await Ennuizel.newProject('craig-' + projName + '-' + id);

  // Get the info
  const response = await fetch(`https://${apiUrl}/api/recording/${id}/users?key=${key}`);
  const data = await response.json();
  if (response.status !== 200) throw new Error(data.error);
  const users: { id: string; name?: string; discrim?: string; username: string; discriminator: string }[] = data.users;

  // Create the tracks
  const tracks: { idx: number; track: ennuizel.track.AudioTrack }[] = [];
  let idx = 1;
  for (const user of users) {
    const discrim = user.discrim || user.discriminator;
    const track = await project.newAudioTrack({ name: idx + '-' + (user.name || user.username) + (discrim === '0' ? '' : '_' + discrim) });
    tracks.push({ idx, track });
    idx++;
  }

  // Status info
  const status: {
    name: string;
    duration: number | boolean;
    ready: boolean;
  }[] = [];
  for (const track of tracks) status.push({ name: track.track.name, duration: false, ready: false });

  // Show the current status
  function showStatus() {
    const str =
      'Loading...<br/>' +
      status
        .map((x) => {
          let s = x.name + ': ';
          if (x.ready === false) {
            s += 'Waiting...';
          } else if (x.duration === false) {
            s += 'Not yet loading';
          } else if (x.duration === true) {
            s += 'Finished loading';
          } else {
            s += Ennuizel.util.timestamp(x.duration);
          }
          return s;
        })
        .join('<br/>');
    d.box.innerHTML = str;
  }

  // Function to load a track
  async function loadTrack(track: ennuizel.track.AudioTrack, idx: number, sidx: number) {
    // Make a libav instance
    const libav = await Ennuizel.avthreads.get();

    // Make the connection
    const sock = new WebSocket(`wss://${apiUrl}/api/ennuizel`);
    sock.binaryType = 'arraybuffer';

    // Receive data
    let first = true;
    const incoming: ArrayBuffer[] = [];
    let incomingRes: (x: unknown) => void = null;
    sock.onmessage = (ev) => {
      if (first) {
        // FIXME: First message is an acknowledgement.  Actually check it!
        if (ev.data === '{"ok":true}') {
          console.log(`Track #${idx} acknowledged`);
          first = false;
          status[sidx].ready = true;
          showStatus();
        } else console.warn(`Track #${idx} sent invalid first message!`);
        return;
      }

      // Accept the data
      incoming.push(ev.data);

      // And inform the reader
      if (incomingRes) incomingRes(null);
    };

    // Log in
    sock.onopen = () => sock.send(JSON.stringify({ i: id, k: key, t: idx }));

    sock.onclose = (ev) => console.log(`Track #${idx} socket closed`, ev);

    // Reader for incoming data
    const inStream = new Ennuizel.ReadableStream({
      async pull(controller) {
        while (true) {
          if (incoming.length) {
            // Get the part
            const part = incoming.shift();
            const partD = new DataView(part);
            const wsClosed = sock.readyState === WebSocket.CLOSING || sock.readyState === WebSocket.CLOSED;

            // Ack it
            if (!wsClosed) {
              const ack = new DataView(new ArrayBuffer(8));
              ack.setUint32(4, partD.getUint32(0, true), true);
              sock.send(ack);
            }

            // And enqueue it
            if (part.byteLength > 4) {
              controller.enqueue(new Uint8Array(part).slice(4));
            } else {
              controller.close();
              if (!wsClosed) sock.close();
            }

            break;
          }

          // No incoming data, so wait for more
          await new Promise((res) => (incomingRes = res));
          incomingRes = null;
        }
      }
    });
    const inRdr = inStream.getReader();

    // Get 1MB of data to queue up libav
    const fname = 'tmp-' + idx + '.ogg';
    await libav.mkreaderdev(fname);
    {
      let remaining = 1024 * 1024;
      while (remaining > 0) {
        const rd = await inRdr.read();
        if (rd.done) {
          await libav.ff_reader_dev_send(fname, null);
          break;
        }
        await libav.ff_reader_dev_send(fname, rd.value);
        remaining -= rd.value.length;
      }
    }

    // Prepare to decode
    const [fmt_ctx, [stream]] = await libav.ff_init_demuxer_file(fname);
    const [, c, pkt, frame] = await libav.ff_init_decoder(stream.codec_id, stream.codecpar);

    // We also need to change the format
    let filter_graph = -1,
      buffersrc_ctx = -1,
      buffersink_ctx = -1;

    // Readable stream for the track
    const trackStream = new Ennuizel.ReadableStream({
      async pull(controller) {
        // Decode
        while (true) {
          // Read a bit
          const [readRes, packets] = await libav.ff_read_multi(fmt_ctx, pkt, fname, { limit: 4096 });
          const eof = readRes === libav.AVERROR_EOF;
          if (!packets[stream.index] && !eof) {
            // Read a bit more
            const rd = await inRdr.read();
            await libav.ff_reader_dev_send(fname, rd.done ? null : rd.value);
            continue;
          }

          // Decode it
          const frames = await libav.ff_decode_multi(c, pkt, frame, packets[stream.index] || [], eof);

          // Prepare the filter
          if (frames.length && buffersrc_ctx < 0) {
            // Make the filter
            const toFormat = Ennuizel.fromPlanar(frames[0].format);
            track.format = toFormat;
            track.sampleRate = frames[0].sample_rate;
            track.channels = frames[0].channels;
            const channelLayout = track.channels === 1 ? 4 : (1 << track.channels) - 1;

            [filter_graph, buffersrc_ctx, buffersink_ctx] = await libav.ff_init_filter_graph(
              'anull',
              {
                sample_rate: track.sampleRate,
                sample_fmt: frames[0].format,
                channel_layout: channelLayout
              },
              {
                sample_rate: track.sampleRate,
                sample_fmt: toFormat,
                channel_layout: channelLayout
              }
            );
          }

          if (buffersrc_ctx >= 0) {
            // Filter it
            const fframes = await libav.ff_filter_multi(buffersrc_ctx, buffersink_ctx, frame, frames, eof);

            // And send it along
            if (status[sidx].duration === false) status[sidx].duration = 0;
            for (const frame of fframes) {
              controller.enqueue(frame);
              (<number>status[sidx].duration) += frame.nb_samples / track.sampleRate;
            }
            if (eof) status[sidx].duration = true;
            showStatus();

            if (fframes.length && !eof) break;
          }

          if (eof) {
            controller.close();
            break;
          }
        }
      }
    });

    // And append
    await track.append(new Ennuizel.EZStream(trackStream));

    // Clean up
    await libav.avformat_close_input_js(fmt_ctx);
    await libav.ff_free_decoder(c, pkt, frame);
    if (filter_graph >= 0) await libav.avfilter_graph_free_js(filter_graph);
    await libav.unlink(fname);
  }

  // # of threads
  const threads = Math.min(navigator.hardwareConcurrency || 1, 8);
  const promises: Promise<unknown>[] = [];

  // Run them all
  while (tracks.length) {
    // Enqueue normal tracks
    while (tracks.length && promises.length < threads) {
      const track = tracks.shift();
      promises.push(loadTrack(track.track, track.idx, track.idx - 1));
    }

    // Wait for one to finish
    const idx = await Promise.race(promises.map((x, idx) => x.then(() => idx)));
    promises.splice(idx, 1);
  }

  // Wait for them all to finish
  await Promise.all(promises);
  d.box.innerHTML = 'Loading...';

  return project;
}
