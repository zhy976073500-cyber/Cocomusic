import { useEffect, useRef, useState } from 'react';
import {
    listLocalSongs,
    importFiles,
    deleteLocalRecord,
    enrichSweep,
    recordToSong,
    type LocalSongRecord,
} from '../lib/local';
import { player } from '../lib/player';
import { SongRow } from '../ui';
import { PlayAll } from './LibraryPage';

// iOS 文件选择器对 accept 的扩展名清单最稳（audio/* 在 iOS 上会漏文件）；音频与 .lrc 一起多选
const ACCEPT = '.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus,.aif,.aiff,.lrc,audio/*';

export default function LocalPage() {
    const [records, setRecords] = useState<LocalSongRecord[]>([]);
    const [importing, setImporting] = useState(false);
    const [note, setNote] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    async function refresh() {
        setRecords(await listLocalSongs());
    }

    useEffect(() => {
        void refresh();
        // 启动补识别：缺封面/歌词的老歌补一轮，完成后再刷一次列表
        enrichSweep().then(() => refresh()).catch(() => undefined);
    }, []);

    async function onPick(files: FileList | null) {
        if (!files || !files.length) return;
        setImporting(true);
        setNote('导入中…');
        try {
            const res = await importFiles([...files]);
            const parts: string[] = [];
            if (res.added.length) parts.push(`导入了 ${res.added.length} 首`);
            if (res.skipped) parts.push(`${res.skipped} 首已存在跳过`);
            setNote(parts.length ? parts.join('，') : '没识别到音频文件');
            await refresh();
            // 导入的新歌再补一轮识别结果
            setTimeout(() => void refresh(), 2500);
        } catch (e) {
            setNote(`导入失败：${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setImporting(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    }

    const songs = records.map(recordToSong);

    return (
        <div className="page">
            <h1>本地导入</h1>
            <input ref={fileRef} type="file" multiple accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => void onPick(e.target.files)} />
            <button className="importbtn" disabled={importing} onClick={() => fileRef.current?.click()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
                    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                </svg>
                {importing ? '导入中…' : '导入歌曲'}
            </button>
            <p className="hint">多选音频文件；有同名 .lrc 歌词文件就一起选进来，会自动配对。导入后联网补封面和歌词（免费直连，不经服务器）。</p>
            {note && <p className="hint">{note}</p>}
            {songs.length > 0 && <PlayAll onClick={() => void player.playQueue(songs, 0)} />}
            <div className="songlist">
                {records.map((rec, i) => (
                    <SongRow
                        key={rec.id}
                        song={songs[i]}
                        showHeart
                        onPlay={() => void player.playQueue(songs, i)}
                        right={
                            <button
                                className="iconbtn"
                                aria-label="删除这首本地歌曲"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!window.confirm(`删除「${rec.title}」？`)) return;
                                    await deleteLocalRecord(rec.id);
                                    await refresh();
                                }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2m3 0-.8 12.2a2 2 0 0 1-2 1.8H8.8a2 2 0 0 1-2-1.8L6 7" />
                                </svg>
                            </button>
                        }
                    />
                ))}
            </div>
            {records.length === 0 && <p className="hint">还没有本地歌曲。</p>}
        </div>
    );
}
