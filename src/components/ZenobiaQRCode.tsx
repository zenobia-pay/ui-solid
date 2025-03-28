import { createSignal, onMount, Component } from "solid-js";
import { ZenobiaClient } from "@zenobia/client";

interface ZenobiaQRCodeProps {
  paymentUrl: string | number; // Accept either string or number
  size?: number;
  darkColor?: string;
  lightColor?: string;
  alt?: string;
}

export const ZenobiaQRCode: Component<ZenobiaQRCodeProps> = (props) => {
  const [qrDataUrl, setQrDataUrl] = createSignal<string>("");
  const [loading, setLoading] = createSignal<boolean>(true);
  const [error, setError] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      setLoading(true);
      // Initialize client with default parameters as per the implementation
      const client = new ZenobiaClient("test_key", "https://api.zenobia.pay");

      // Convert paymentUrl to number if it's a string
      let paymentId: number;
      if (typeof props.paymentUrl === "string") {
        paymentId = parseInt(props.paymentUrl, 10);
        if (isNaN(paymentId)) {
          throw new Error("Invalid payment ID");
        }
      } else {
        paymentId = props.paymentUrl;
      }

      // Call the generateQRCode method with the payment ID
      const qrCode = await client.generateQRCode(paymentId);

      setQrDataUrl(qrCode);
      setLoading(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate QR code"
      );
      setLoading(false);
    }
  });

  return (
    <div class="zenobia-qr-code">
      {loading() && <div class="zenobia-loading">Loading QR code...</div>}
      {error() && <div class="zenobia-error">Error: {error()}</div>}
      {!loading() && !error() && (
        <img
          src={qrDataUrl()}
          alt={props.alt || "Zenobia Payment QR Code"}
          width={props.size || 200}
          height={props.size || 200}
        />
      )}
    </div>
  );
};
