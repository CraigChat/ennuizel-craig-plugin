/*
 * Copyright (c) 2021 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

/*
 * This file defines the API for plugins
 *
 * Note that more functionality is exposed than is documented in this file.
 * ANYTHING THAT IS NOT DOCUMENTED IN THIS FILE IS NOT PART OF THE PUBLIC API
 * AND IS SUBJECT TO CHANGE AT ANY TIME. Only use the listed functionality
 * here.
 */

declare namespace ennuizel {
  type TypedArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;

  /**
   * The frame format given by libav.js
   */
  interface LibAVFrame {
    /**
     * The actual data. Note that in real libav.js frames, this could be an
     * array of typed arrays, if it's planar, but Ennuizel only handles
     * non-planar data.
     */
    data: TypedArray;

    /**
     * The sample rate.
     */
    sample_rate: number;

    /**
     * The sample format.
     */
    format: number;

    /**
     * The number of channels. Either this or channel_layout should be set.
     */
    channels?: number;

    /**
     * The layout of the channels. Either this or channels should be set.
     */
    channel_layout?: number;

    /**
     * The number of samples. This does not have to be set, and can be divined
     * from the length of data.
     */
    nb_samples?: number;

    /**
     * Not part of original libav.js, but provided by streams for tracks.
     */
    node?: unknown;
  }

  /**
   * A ReadableStream paired with the ability to push back data. Use
   * Ennuizel.EZStream, not ennuizel.EZStream.
   */
  class EZStream<R> {
    /**
     * Create an EZStream.
     * @param readableStream  The underlying ReadableStream.
     */
    constructor(readableStream: ReadableStream<R>);

    /**
     * Read an element. Returns null if the stream has ended.
     */
    read(): Promise<R>;

    /**
     * Cancel the stream.
     */
    cancel(): void;

    /**
     * Push this chunk back. It will be returned eagerly by the next read.
     */
    push(chunk: R): void;

    /**
     * Is this stream finished?
     */
    isDone(): boolean;
  }

  /**
   * An Ennuizel project. Only one project can be loaded at a time, so there
   * should only ever be one instance of this type at a time.
   */
  interface Project {
    /**
     * Delete this project.
     */
    del(): Promise<void>;

    /**
     * Internal ID for the project.
     */
    readonly id: string;

    /**
     * Name of the project.
     */
    readonly name: string;

    /**
     * Create a new audio track. The track is added to the project if it's not temporary.
     * @param opts  Options for creating the track.
     */
    newAudioTrack(opts?: { name?: string; temp?: boolean }): Promise<track.AudioTrack>;

    /**
     * Create a new caption track.
     * @param opts  Options for creating the track.
     */
    newCaptionTrack(opts?: { name?: string; temp?: boolean }): Promise<captions.CaptionTrack>;

    /**
     * Add a track that's already been created.
     * @param track  The track to add.
     */
    addTrack(track: track.Track): Promise<void>;

    /**
     * Remove a track. The track is deleted even if it was never actually added
     * to the project, so this is also the way to delete a track.
     * @param track  The track to remove.
     */
    removeTrack(track: track.Track): Promise<void>;
  }

  // Audio tracks
  namespace track {
    /**
     * A unifying track type for all tracks.
     */
    interface Track {
      /**
       * Return the type of this track.
       */
      type(): number;

      /**
       * The name for this track.
       */
      readonly name: string;
    }

    interface AudioTrack extends Track {
      /**
       * Append data from a stream of raw data. The chunks must be LibAVFrames.
       * If they don't have the correct format, sample rate, or channel count,
       * they will be filtered, but this is only applied after the first has
       * arrived, so the caller can change the track properties before then.
       * @param rstream  The stream to read from.
       */
      append(rstream: EZStream<LibAVFrame>): Promise<void>;

      /**
       * Append a single chunk of raw data.
       * @param data  The single chunk of data.
       */
      appendRaw(data: TypedArray): Promise<void>;

      /**
       * Get the duration, in seconds, of this track.
       */
      duration(): number;

      /**
       * Get the number of samples in this track. This is, in essence, the
       * duration in samples times the number of channels.
       */
      sampleCount(): number;

      /**
       * Get this data as a ReadableStream. Packets are sent roughly in libav.js
       * format, but with the AudioData node specified in a `node` field.
       * @param opts  Options. In particular, you can set the start and end time
       *              here.
       */
      stream(opts?: { start?: number; end?: number; keepOpen?: boolean }): ReadableStream<any>;

      /**
       * Overwrite a specific range of data from a ReadableStream. The stream
       * must give TypedArray chunks, and must be of the same length as is being
       * overwritten. A stream() with keepOpen and an overwrite() with closeTwice
       * creates an effective filter.
       * @param data  Input data.
       * @param opts  Options. In particular, you can set the start and end time
       *              here.
       */
      overwrite(
        data: EZStream<LibAVFrame>,
        opts?: {
          start?: number;
          end?: number;
          closeTwice?: boolean;
        }
      ): Promise<void>;

      /**
       * Replace a segment of audio data with the audio data from another track.
       * The other track will be deleted. Can clip (by not giving a replacement)
       * or insert (by replacing no time) as well.
       * @param start  Start time, in seconds.
       * @param end  End time, in seconds.
       * @param replacement  Track containing replacement data, which must be in
       *                     the same format, sample rate, number of tracks.
       */
      replace(start: number, end: number, replacement: AudioTrack): Promise<void>;

      /**
       * Format of samples in this track, in libav format code.
       */
      format: number;

      /**
       * Sample rate of this track.
       */
      sampleRate: number;

      /**
       * Number of channels in this track.
       */
      channels: number;
    }
  }

  // Caption tracks
  namespace captions {
    /**
     * Vosk-style caption data.
     */
    interface VoskWord {
      /**
       * The actual word represented.
       */
      word: string;

      /**
       * Start time.
       */
      start: number;

      /**
       * End time.
       */
      end: number;

      /**
       * Confidence (optional).
       */
      conf?: number;
    }

    /**
     * A caption track. A CaptionTrack is stored in an array of CaptionDatas, each
     * of which is a "line" of caption words, associated with their HTML nodes. The
     * CaptionTrack itself holds a link to the associated AudioTrack by ID, if
     * there is one. CaptionTracks are stored as caption-track-id.
     */
    interface CaptionTrack extends track.Track {
      /**
       * Append data from a stream of raw data. The chunks must be arrays of
       * VoskWords.
       * @param rstream  The stream to read from.
       */
      append(rstream: EZStream<VoskWord[]>): Promise<void>;

      /**
       * Append chunks of raw data.
       * @param lines  Chunks of data (lines of vosk words).
       * @param opts  Other options, really only intended to be used by append.
       */
      appendRaw(
        lines: VoskWord[][],
        opts?: {
          noSave?: boolean;
        }
      ): Promise<void>;

      /**
       * Get this data as a ReadableStream. Packets are set as lines (arrays of
       * VoskWords).
       * @param opts  Options. In particular, you can set the start and end time
       *              here.
       */
      stream(opts?: { start?: number; end?: number }): ReadableStream<VoskWord[]>;

      /**
       * Replace a segment of caption data with the caption data from another
       * track. The other track will be deleted. Can clip (by not giving a
       * replacement) or insert (by replacing no time) as well.
       * @param start  Start time, in seconds.
       * @param end  End time, in seconds.
       * @param replacement  Track containing replacement data.
       */
      replace(start: number, end: number, replacement: CaptionTrack): Promise<void>;

      /**
       * Convert this track to WebVTT.
       */
      toVTT(): string;

      /**
       * Display name for this track.
       */
      readonly name: string;

      /**
       * The associated audio track.
       */
      readonly audioTrack: string;
    }
  }

  namespace filters {
    /**
     * A custom (presumably non-FFmpeg) filter, provided by a plugin.
     */
    interface CustomFilter {
      /**
       * User-visible name for the filter. May include underscores for
       * hotkeyability, but beware overlaps.
       */
      name: string;

      /**
       * Function to run to perform the filter *from the UI*. If you want an
       * automated filter, expose it as part of your plugin API.
       */
      filter: (d: ui.Dialog) => Promise<void>;
    }

    interface Filters {
      /**
       * Convert this LibAVFrame stream to the desired sample rate, format, and
       * channel count.
       * @param stream  Input LibAVFrame stream.
       * @param sampleRate  Desired sample rate.
       * @param format  Desired sample format.
       * @param channels  Desired channel count.
       * @param opts  Other options.
       */
      resample(
        stream: EZStream<LibAVFrame>,
        sampleRate: number,
        format: number,
        channels: number,
        opts?: {
          fs?: string;
          reframe?: boolean;
        }
      ): Promise<ReadableStream<LibAVFrame>>;

      /**
       * Create a stream to apply the given libav filter, described by a filter
       * string.
       * @param stream  The input stream.
       * @param fs  The filter string.
       */
      ffmpegStream(stream: EZStream<LibAVFrame>, fs: string): Promise<ReadableStream<LibAVFrame>>;

      /**
       * Apply a filter function to a selection.
       * @param ff  The filter function.
       * @param changesDuration  Set if this filter changes duration, so the process
       *                         must use a temporary track.
       * @param sel  The selection to filter.
       * @param d  (Optional) The dialog in which to show the status, if applicable.
       *           This dialog will *not* be closed.
       */
      selectionFilter(
        ff: (x: EZStream<LibAVFrame>) => Promise<ReadableStream<LibAVFrame>>,
        changesDuration: boolean,
        sel: select.Selection,
        d: ui.Dialog
      ): Promise<void>;

      /**
       * Register a custom filter.
       * @param filter  The filter.
       */
      registerCustomFilter(filter: CustomFilter): void;

      /**
       * Mix the selected tracks into a new track. Note that the track is
       * *not* automatically added to the project.
       * @param sel  The selection to mix.
       * @param d  (Optional) The dialog in which to show the status, if applicable.
       *           This dialog will *not* be closed.
       * @param opts  Other options.
       */
      mixTracks(
        sel: select.Selection,
        d: ui.Dialog,
        opts?: {
          preFilter?: (x: EZStream<LibAVFrame>) => Promise<ReadableStream<LibAVFrame>>;
          postFilter?: (x: EZStream<LibAVFrame>) => Promise<ReadableStream<LibAVFrame>>;
        }
      ): Promise<track.Track>;
    }
  }

  // Named with two t's since "export" is reserved
  namespace exportt {
    /**
     * Format options for exporting.
     */
    interface ExportOptionsBase {
      /**
       * File format for export.
       */
      format: string;

      /**
       * Codec, in libav terms.
       */
      codec: string;

      /**
       * Sample format, in libav terms.
       */
      sampleFormat: number;

      /**
       * Sample rate, if not variable.
       */
      sampleRate?: number;

      /**
       * Filename extension, if not the same as format.
       */
      ext?: string;
    }

    /**
     * Per-export options for exporting.
     */
    interface ExportOptions extends ExportOptionsBase {
      /**
       * Filename prefix.
       */
      prefix: string;

      /**
       * Export all audio on selected tracks, not just selected audio.
       */
      allAudio?: boolean;

      /**
       * Export with the track name suffixed, even if only exporting one track.
       */
      suffixTrackName?: boolean;
    }
  }

  namespace avthreads {
    /**
     * Threaded libav access.
     */
    interface AVThreads {
      /**
       * Get a libav thread.
       */
      get(): Promise<any>;
    }
  }

  namespace util {
    /**
     * Utility functions.
     */
    interface Util {
      /**
       * Convert a time in seconds to a string timestamp.
       * @param s  The time.
       * @param min  Show only the fields needed.
       */
      timestamp(s: number, min?: boolean): string;
    }
  }

  namespace ui {
    /**
     * A dialog box.
     */
    interface Dialog {
      readonly box: HTMLElement;
    }

    /**
     * Options for opening a dialog.
     */
    interface DialogOptions {
      reuse?: Dialog;
      closeable?: boolean;
      keepOpen?: boolean;
      forceClose?: boolean;
    }

    /**
     * UI-related support for hotkeys.
     */
    interface Hotkeys {
      /**
       * Register a hotkey.
       * @param el  The element to click when the hotkey is pressed.
       * @param dialog  The dialog that the hotkey element is contained in, or null
       *                if it's not in a dialog.
       * @param key  The hot key itself.
       */
      registerHotkey(el: HTMLElement, dialog: ui.Dialog, key: string): void;

      /**
       * Unregister an element's hotkey.
       * @param el  The element.
       */
      unregisterHotkey(el: HTMLElement): void;

      /**
       * Make an element hotkeyable.
       * @param parent  The dialog that the element will be placed in (but note that
       *                it's the caller's job to place the element).
       * @param lbl  The label to be hotkey-ified. Will be passed back to the
       *             callback without its _.
       * @param callback  The function to actually create the element, and presumably
       *                  add it to the DOM (though you're free to do that later).
       */
      mk<T extends HTMLElement>(parent: ui.Dialog, lbl: string, callback: (lbl: string) => T): T;

      /**
       * Make a button with a hotkey.
       * @param parent  The dialog to place the button in.
       * @param lbl  The label for the button, including an _ before the letter
       *             representing the hotkey.
       * @param opts  Other options.
       */
      btn(parent: ui.Dialog, lbl: string, opts?: any): any;

      /**
       * Make a <label/> with a hotkey.
       * @param parent  The dialog to place the label in.
       * @param htmlFor  ID of the element that this label corresponds to.
       * @param lbl  Text of the label.
       * @param opts  Other options.
       */
      lbl(parent: ui.Dialog, htmlFor: string, lbl: string, opts?: any): any;
    }

    /**
     * The UI API.
     */
    interface UI {
      /**
       * Create a dialog box. If it's not closeable by the user, will close
       * automatically after the callback finishes.
       * @param callback  Function to call with the dialog box.
       * @param opts  Other options.
       */
      dialog<T>(callback: (x: Dialog, y: (x: HTMLElement) => unknown) => Promise<T>, opts?: DialogOptions): Promise<T>;

      /**
       * Wrapper to quickly close a dialog box that's been kept open.
       * @param d  The dialog.
       */
      dialogClose(d: Dialog): Promise<void>;

      /**
       * Show a loading screen while performing some task.
       * @param callback  The callback to run while the loading screen is shown.
       */
      loading<T>(callback: (x: Dialog) => Promise<T>, opts?: DialogOptions): Promise<T>;

      /**
       * Show an OK-only alert box.
       * @param html  innerHTML of the dialog.
       */
      alert(html: string): Promise<void>;

      /**
       * Load a library.
       * @param name  URL of the library to load.
       */
      loadLibrary(name: string): Promise<void>;

      /**
       * Make an element.
       * @param el  Element type.
       * @param parent  Element to add it to.
       * @param opts  Attributes to set.
       */
      mk(el: string, parent: HTMLElement, opts?: any): any;

      /**
       * Make a <button/>
       * @param parent  Element to add it to.
       * @param innerHTML  Text of the button.
       * @param opts  Other options.
       */
      btn(parent: HTMLElement, innerHTML: string, opts?: any): any;

      /**
       * Make a <label/>
       * @param parent  Element to add it to.
       * @param htmlFor  ID of the element this label corresponds to.
       * @param innerHTML  Text of the label.
       * @param opts  Other options.
       */
      lbl(parent: HTMLElement, htmlFor: string, innerHTML: string, opts?: any): any;
    }
  }

  namespace select {
    /**
     * Interface for the current selection.
     */
    interface Selection {
      range: boolean;
      start: number;
      end: number;
      tracks: track.Track[];
    }

    interface Select {
      /**
       * Get the current selection.
       */
      getSelection(): Selection;

      /**
       * Set the *time* of the selection. Don't set the end time to select all time.
       * @param start  Start time. Default 0.
       * @param end  Optional end time.
       */
      selectTime(start?: number, end?: number): Promise<void>;

      /**
       * Set the *tracks* currently selected. Does not update the time.
       * @param tracks  Array of tracks to select. May be empty.
       */
      selectTracks(tracks: track.Track[]): Promise<void>;

      /**
       * Select all selectables, and clear the range so that everything is selected.
       * @param opts  Selection options.
       */
      selectAll(opts?: { tracksOnly?: boolean }): Promise<void>;
    }
  }

  /**
   * The interface the plugin writer must provide.
   */
  interface Plugin {
    /**
     * Public name of the plugin.
     */
    name: string;

    /**
     * API name of the plugin.
     */
    id: string;

    /**
     * URL for *information* on the plugin (not for the plugin itself)
     */
    infoURL: string;

    /**
     * A full description of the plugin, in HTML.
     */
    description: string;

    /**
     * License information.
     */
    licenseInfo: string;

    /**
     * The plugin's URL. This is set by registerPlugin, not the plugin.
     */
    url?: string;

    /**
     * An optional load function to finish loading the plugin.
     */
    load?: () => Promise<void>;

    /**
     * A "wizard" (optional) to use in place of the normal Ennuizel flow.
     */
    wizard?: (d: ui.Dialog) => Promise<void>;

    /**
     * A wizard to be used *during* normal Ennuizel flow.
     */
    postWizard?: (project: Project) => Promise<void>;

    /**
     * The API for your plugin itself, which other plugins can use.
     */
    api?: any;
  }

  interface Ennuizel {
    /**
     * Call this to register your plugin. Every plugin *must* call this.
     * @param plugin  The plugin to register.
     */
    registerPlugin(plugin: Plugin): void;

    /**
     * Load a plugin by URL. Returns null if the plugin cannot be loaded.
     * @param url  The absolute URL (protocol optional) from which to load
     *             the plugin.
     */
    loadPlugin(url: string): Promise<Plugin>;

    /**
     * Get the loaded plugin with this ID, if such a plugin has been
     * loaded.
     * @param id  The ID of the plugin.
     */
    getPlugin(id: string): Plugin;

    /**
     * web-streams-polyfill's ReadableStream.
     */
    readonly ReadableStream: typeof ReadableStream;

    /**
     * And our own EZStream.
     */
    readonly EZStream: typeof EZStream;

    /**
     * The filter interface.
     */
    readonly filters: filters.Filters;

    /**
     * libav threading.
     */
    readonly avthreads: avthreads.AVThreads;

    /**
     * Utility functions.
     */
    readonly util: util.Util;

    /**
     * Hotkey interactions.
     */
    readonly hotkeys: ui.Hotkeys;

    /**
     * The UI.
     */
    readonly ui: ui.UI;

    /**
     * Selection.
     */
    readonly select: select.Select;

    /**
     * All supported track types.
     */
    readonly TrackType: {
      readonly Audio: number;
    };

    /**
     * libav's sample formats.
     */
    readonly LibAVSampleFormat: {
      readonly U8: number;
      readonly S16: number;
      readonly S32: number;
      readonly FLT: number;
      readonly DBL: number;
      readonly U8P: number;
      readonly S16P: number;
      readonly S32P: number;
      readonly FLTP: number;
      readonly DBLP: number;
      readonly S64: number;
      readonly S64P: number;
    };

    /**
     * Convert a (libav) format to its planar equivalent.
     * @param format  The input format, which may or may not be planar.
     */
    toPlanar(format: number): number;

    /**
     * Convert a (libav) format to its non-planar equivalent.
     * @param format  The input format, which may or may not be planar.
     */
    fromPlanar(format: number): number;

    /**
     * Create (and load) a new project with the given name.
     * @param name  Name for the project.
     */
    newProject(name: string): Promise<Project>;

    /**
     * Get the list of projects.
     */
    getProjects(): Promise<{ id: string; name: string }[]>;

    /**
     * Load a project by ID.
     * @param id  The ID of the project to load.
     */
    loadProject(id: string): Promise<Project>;

    /**
     * Unload the current project from the user interface.
     */
    unloadProject(): Promise<void>;

    /**
     * Delete a project by ID. You can delete the *current* project with
     * its del() method.
     * @param id  ID of the project to delete.
     */
    deleteProjectById(id: string): Promise<void>;

    /**
     * Mark this as an undo point. If an undo is performed, it will stop
     * here. Should be done at any *UI* interaction that changes data.
     */
    undoPoint(): void;

    /**
     * Disable undo for the currently loaded project.
     */
    disableUndo(): Promise<void>;

    /**
     * Standard export formats.
     */
    readonly standardExports: { name: string; options: exportt.ExportOptionsBase }[];

    /**
     * Export selected audio with the given options.
     * @param opts  Export options.
     * @param sel  The selection to export.
     * @param d  A dialog in which to show progress, if desired.
     */
    exportAudio(opts: exportt.ExportOptions, sel: select.Selection, d: ui.Dialog): Promise<unknown>;

    /**
     * Export an Audacity project from this audio.
     * @param opts  Export options. ext must be ogg.
     * @param sel  The selection to export.
     * @param d  A dialog in which to show progress, if desired.
     */
    exportAudacity(opts: exportt.ExportOptions, sel: select.Selection, d: ui.Dialog): Promise<void>;

    /**
     * Export selected captions.
     * @param opts  Export options.
     * @param sel  The selection to export.
     * @param d  A dialog in which to show progress, if desired.
     */
    exportCaption(opts: { prefix: string }, sel: select.Selection, d: ui.Dialog): Promise<void>;
  }
}

/**
 * The entry point for plugins.
 */
declare let Ennuizel: ennuizel.Ennuizel;
