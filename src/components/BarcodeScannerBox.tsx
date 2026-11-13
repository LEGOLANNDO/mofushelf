import React, { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CameraOff, RefreshCw } from 'lucide-react';

interface BarcodeScannerBoxProps {
  active: boolean;
  onToggleActive: () => void;
  onDetectedIsbn: (isbn13: string) => void;
  onIgnoredJan: (janCode: string) => void;
}

export const BarcodeScannerBox: React.FC<BarcodeScannerBoxProps> = ({
  active,
  onToggleActive,
  onDetectedIsbn,
  onIgnoredJan,
}) => {
  const rawId = useId().replace(/:/g, '');
  const elementId = `mofu-qr-reader-${rawId}`;

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastDetectedRef = useRef<{ code: string; time: number }>({
    code: '',
    time: 0,
  });
  const lastIgnoredTimeRef = useRef<number>(0);

  const onDetectedRef = useRef(onDetectedIsbn);
  const onIgnoredRef = useRef(onIgnoredJan);
  onDetectedRef.current = onDetectedIsbn;
  onIgnoredRef.current = onIgnoredJan;

  const [cameraStatus, setCameraStatus] = useState<
    'idle' | 'starting' | 'running' | 'unavailable'
  >('idle');
  const [errorDetail, setErrorDetail] = useState<string>('');
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const stopScanner = async () => {
      const instance = scannerRef.current;
      if (instance) {
        try {
          if (instance.isScanning) {
            await instance.stop();
          }
          instance.clear();
        } catch {
          // 既に停止済みの場合は無視
        }
        scannerRef.current = null;
      }
    };

    if (!active) {
      stopScanner();
      setCameraStatus('idle');
      return () => {
        cancelled = true;
      };
    }

    const startScanner = async () => {
      setCameraStatus('starting');
      setErrorDetail('');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (!cancelled) {
          setCameraStatus('unavailable');
          setErrorDetail(
            'このブラウザ環境ではカメラAPIが利用できません（下のテストボタン・ISBN手入力が使えます）。'
          );
        }
        return;
      }

      try {
        const html5Qr = new Html5Qrcode(elementId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13],
          verbose: false,
        });
        scannerRef.current = html5Qr;

        await html5Qr.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (viewfinderWidth, viewfinderHeight) => ({
              width: Math.max(180, Math.floor(viewfinderWidth * 0.82)),
              height: Math.max(85, Math.floor(viewfinderHeight * 0.45)),
            }),
            aspectRatio: 1.4,
          },
          (decodedText) => {
            const cleaned = decodedText.replace(/[^0-9]/g, '');
            const now = Date.now();

            // 2段バーコードの下段 (192始まり) を自動無視
            if (cleaned.startsWith('192')) {
              if (now - lastIgnoredTimeRef.current > 2200) {
                lastIgnoredTimeRef.current = now;
                onIgnoredRef.current(cleaned);
              }
              return;
            }

            // 978 または 979 の13桁ISBNのみ通過
            if (
              cleaned.length === 13 &&
              (cleaned.startsWith('978') || cleaned.startsWith('979'))
            ) {
              const isSameRecently =
                lastDetectedRef.current.code === cleaned &&
                now - lastDetectedRef.current.time < 3200;
              if (isSameRecently) return;

              lastDetectedRef.current = { code: cleaned, time: now };
              onDetectedRef.current(cleaned);
            }
          },
          () => {
            // フレームごとの未検出エラーは無視
          }
        );

        if (!cancelled) {
          setCameraStatus('running');
        } else {
          await stopScanner();
        }
      } catch (err) {
        if (!cancelled) {
          setCameraStatus('unavailable');
          const msg = err instanceof Error ? err.message : String(err);
          setErrorDetail(
            msg.includes('Permission') || msg.includes('NotAllowed')
              ? 'カメラ権限が許可されませんでした。下のテストボタンやISBN入力をご利用ください。'
              : 'カメラが見つからないか使用中です（PCブラウザでも下のボタンやISBN入力で実API検索を試せます）。'
          );
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [active, elementId, retryTick]);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl bg-[#383029] text-white min-h-[188px] flex flex-col items-center justify-center">
        {/* html5-qrcode マウント領域（320px幅でも横はみ出し防止） */}
        <div
          id={elementId}
          className={`w-full overflow-hidden [&_video]:!w-full [&_video]:!h-auto [&_video]:!object-cover ${
            cameraStatus === 'running' ? 'block' : 'hidden'
          }`}
        />

        {cameraStatus === 'running' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-2">
            <span className="rounded-full bg-[#4A3F35]/85 px-2.5 py-1 text-[10px] font-bold text-mofu-mint backdrop-blur-sm">
              上段 978/979 をスキャン中（192は自動スキップ）
            </span>
          </div>
        )}

        {cameraStatus === 'starting' && (
          <div className="p-4 text-center space-y-1.5">
            <Camera className="mx-auto h-7 w-7 text-mofu-mint animate-pulse" />
            <p className="text-xs font-bold">カメラを起動しています...</p>
          </div>
        )}

        {cameraStatus === 'idle' && (
          <div className="p-4 text-center space-y-2">
            <CameraOff className="mx-auto h-7 w-7 text-white/60" />
            <p className="text-xs font-bold text-white/80">カメラは停止中です</p>
            <button
              type="button"
              onClick={onToggleActive}
              className="min-h-[40px] rounded-xl bg-mofu-pink px-3.5 text-xs font-extrabold text-white"
            >
              カメラを再開する
            </button>
          </div>
        )}

        {cameraStatus === 'unavailable' && (
          <div className="p-4 text-center space-y-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <Camera className="h-5 w-5 text-mofu-yellow" />
            </div>
            <p className="text-[11px] font-bold leading-relaxed text-white/90">
              {errorDetail}
            </p>
            <button
              type="button"
              onClick={() => setRetryTick((t) => t + 1)}
              className="min-h-[38px] inline-flex items-center gap-1 rounded-xl bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/25"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              カメラ再試行
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
