import {
  createSignal,
  Component,
  createEffect,
  onCleanup,
  Show,
} from "solid-js";
import { ZenobiaClient } from "@zenobia/client";
import QRCode from "qrcode";

// Import or define the StatementItem interface to match the client
export interface StatementItem {
  name: string;
  amount: number;
}

export interface CreateTransferRequestResponse {
  transferRequestId: string;
  merchantId: string;
  expiry?: number;
  signature?: string;
}

// Define the TransferStatus enum
export enum TransferStatus {
  PENDING = "PENDING",
  IN_FLIGHT = "IN_FLIGHT",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

// Define interface for client TransferStatus
interface ClientTransferStatus {
  status: string;
  [key: string]: any;
}

interface ZenobiaPaymentButtonProps {
  amount: number;
  url: string; // Full URL to the payment endpoint
  statementItems?: StatementItem[]; // Optional statement items
  buttonText?: string;
  buttonClass?: string;
  qrCodeSize?: number;
  onSuccess?: (response: CreateTransferRequestResponse) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: TransferStatus) => void;
}

export const ZenobiaPaymentButton: Component<ZenobiaPaymentButtonProps> = (
  props
) => {
  const [loading, setLoading] = createSignal<boolean>(false);
  const [showQR, setShowQR] = createSignal<boolean>(false);
  const [transferRequest, setTransferRequest] =
    createSignal<CreateTransferRequestResponse | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = createSignal<string | null>(null);
  const [transferStatus, setTransferStatus] = createSignal<TransferStatus>(
    TransferStatus.PENDING
  );
  const [error, setError] = createSignal<string | null>(null);
  const [isConnected, setIsConnected] = createSignal(false);
  const [zenobiaClient, setZenobiaClient] = createSignal<ZenobiaClient | null>(
    null
  );
  const [isAnimating, setIsAnimating] = createSignal(false);

  // Generate QR code when transfer request is created
  createEffect(() => {
    const request = transferRequest();
    if (request?.transferRequestId && request?.merchantId) {
      const transferIdNoDashes = request.transferRequestId.replace(/-/g, "");
      // Convert to base64URL format (no padding)
      const base64TransferId = btoa(transferIdNoDashes)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const qrString = `https://zenobiapay.com/clip?id=${base64TransferId}`;

      console.log("Transfer ID:", request.transferRequestId);
      console.log("Base64 Transfer ID:", qrString);
      QRCode.toDataURL(qrString, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: props.qrCodeSize || 200,
      })
        .then((url) => {
          setQrCodeDataUrl(url);
        })
        .catch((err) => {
          console.error("Error generating QR code:", err);
          setError("Failed to generate QR code");
        });
    }
  });

  // Handle WebSocket status update
  const handleStatusUpdate = (status: ClientTransferStatus) => {
    console.log("Received status update:", status);

    // Convert API status to our enum
    let currentStatus: TransferStatus;
    switch (status.status) {
      case "COMPLETED":
        currentStatus = TransferStatus.COMPLETED;
        break;
      case "FAILED":
        currentStatus = TransferStatus.FAILED;
        break;
      case "CANCELLED":
        currentStatus = TransferStatus.CANCELLED;
        break;
      case "IN_FLIGHT":
        currentStatus = TransferStatus.IN_FLIGHT;
        break;
      default:
        currentStatus = TransferStatus.PENDING;
    }

    setTransferStatus(currentStatus);

    // Call the onStatusChange callback if provided
    if (props.onStatusChange) {
      props.onStatusChange(currentStatus);
    }
  };

  // Handle WebSocket error
  const handleWebSocketError = (errorMsg: string) => {
    console.error("WebSocket error:", errorMsg);
    setError(errorMsg);
  };

  // Handle WebSocket connection status change
  const handleConnectionChange = (connected: boolean) => {
    console.log(
      "WebSocket connection status:",
      connected ? "Connected" : "Disconnected"
    );
    setIsConnected(connected);
  };

  // Cleanup on component unmount
  onCleanup(() => {
    const client = zenobiaClient();
    if (client) {
      client.disconnect();
    }
  });

  // Function to get badge color based on status
  const getBadgeClass = () => {
    switch (transferStatus()) {
      case TransferStatus.COMPLETED:
        return "badge-success";
      case TransferStatus.FAILED:
      case TransferStatus.CANCELLED:
        return "badge-error";
      case TransferStatus.IN_FLIGHT:
        return "badge-info";
      default:
        return "badge-ghost";
    }
  };

  const handleClick = async () => {
    try {
      setLoading(true);
      setIsAnimating(true);
      // Initialize client
      const client = new ZenobiaClient();
      setZenobiaClient(client);

      // Create default statement item if none provided
      const statementItems = props.statementItems || [
        {
          name: "Payment",
          amount: props.amount,
        },
      ];

      // Call createTransferAndListen with the full URL and callbacks
      const transfer = await client.createTransferAndListen(
        props.url,
        props.amount,
        statementItems,
        handleStatusUpdate,
        handleWebSocketError,
        handleConnectionChange
      );

      // Store transfer request data
      setTransferRequest({
        transferRequestId: transfer.transferRequestId,
        merchantId: transfer.merchantId,
        expiry: transfer.expiry,
        signature: transfer.signature,
      });

      // Add a small delay for the animation
      setTimeout(() => {
        setShowQR(true);
        setLoading(false);
        setIsAnimating(false);
      }, 500);

      if (props.onSuccess) {
        props.onSuccess({
          transferRequestId: transfer.transferRequestId,
          merchantId: transfer.merchantId,
          expiry: transfer.expiry,
          signature: transfer.signature,
        });
      }
    } catch (error) {
      setLoading(false);
      setIsAnimating(false);
      setError(error instanceof Error ? error.message : "An error occurred");

      if (props.onError && error instanceof Error) {
        props.onError(error);
      }
    }
  };

  return (
    <div class="relative w-[240px]">
      <Show
        when={!showQR()}
        fallback={
          <div class="flex flex-col items-center">
            <Show
              when={qrCodeDataUrl()}
              fallback={
                <div class="w-[240px] h-[120px] flex items-center justify-center">
                  <span class="loading">Loading QR code...</span>
                </div>
              }
            >
              <div class="card bg-base-100 shadow-sm p-4 w-[240px] h-[120px] transition-all duration-300 transform">
                <div class="card-body p-4 items-center">
                  <img
                    src={qrCodeDataUrl() || ""}
                    alt="Transfer QR Code"
                    class="w-full h-full object-contain"
                  />
                </div>
              </div>
            </Show>
            <Show when={error()}>
              <div class="mt-2 text-xs text-error">{error()}</div>
            </Show>
          </div>
        }
      >
        <button
          class={`zenobia-payment-button rounded-lg px-6 py-3 w-[240px] h-[120px] transition-all duration-300 transform ${
            isAnimating() ? "scale-95 opacity-50" : ""
          } ${props.buttonClass || ""}`}
          onClick={handleClick}
          disabled={loading()}
        >
          {loading()
            ? "Processing..."
            : props.buttonText || `Pay ${props.amount}`}
        </button>
      </Show>
    </div>
  );
};
