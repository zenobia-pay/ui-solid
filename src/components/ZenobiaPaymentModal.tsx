import {
  Component,
  createSignal,
  createEffect,
  onCleanup,
  Show,
} from "solid-js";
import { ZenobiaClient } from "@zenobia/client";
import QRCodeStyling from "qr-code-styling";
import { TransferStatus } from "./ZenobiaPaymentButton";

interface ClientTransferStatus {
  status: string;
  [key: string]: any;
}

interface ZenobiaPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  transferRequestId?: string;
  signature?: string;
  amount: number;
  discountAmount?: number;
  qrCodeSize?: number;
  url: string; // Full URL to the payment endpoint
  onSuccess?: (status: ClientTransferStatus) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: TransferStatus) => void;
}

export const ZenobiaPaymentModal: Component<ZenobiaPaymentModalProps> = (
  props
) => {
  const [qrCodeObject, setQrCodeObject] = createSignal<QRCodeStyling | null>(
    null
  );
  const qrContainerRef = { current: null as HTMLDivElement | null };
  const [transferStatus, setTransferStatus] = createSignal<TransferStatus>(
    TransferStatus.PENDING
  );
  const [error, setError] = createSignal<string | null>(null);
  const [isConnected, setIsConnected] = createSignal(false);
  const [zenobiaClient, setZenobiaClient] = createSignal<ZenobiaClient | null>(
    null
  );

  // Initialize WebSocket connection when transfer request ID is available
  createEffect(() => {
    if (props.transferRequestId && !zenobiaClient()) {
      const client = new ZenobiaClient();
      setZenobiaClient(client);

      // Listen to the existing transfer
      client.listenToTransfer(
        props.transferRequestId,
        props.signature || "",
        handleStatusUpdate,
        handleWebSocketError,
        handleConnectionChange
      );
    }
  });

  // Generate QR code when transfer request is created
  createEffect(() => {
    if (props.transferRequestId) {
      const transferIdNoDashes = props.transferRequestId.replace(/-/g, "");
      const base64TransferId = btoa(transferIdNoDashes)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const qrString = `https://zenobiapay.com/clip?id=${base64TransferId}`;

      // Use a slightly larger size for the QR code to match the new design
      const containerSize = props.qrCodeSize || 220;
      const qrSize = containerSize; // No reduction, QR fills the container
      const qrCode = new QRCodeStyling({
        width: qrSize,
        height: qrSize,
        type: "svg",
        data: qrString,
        image: undefined,
        dotsOptions: {
          color: "#000000",
          type: "dots",
        },
        backgroundOptions: {
          color: "#ffffff",
        },
        cornersSquareOptions: {
          type: "extra-rounded",
        },
        cornersDotOptions: {
          type: "dot",
        },
        qrOptions: {
          errorCorrectionLevel: "M",
        },
      });

      setQrCodeObject(qrCode);

      // If the container ref is already available, append the QR code
      if (qrContainerRef.current) {
        // Clear any existing content
        qrContainerRef.current.innerHTML = "";
        qrCode.append(qrContainerRef.current);
      }
    }
  });

  // Handle WebSocket status update
  const handleStatusUpdate = (status: ClientTransferStatus) => {
    console.log("Received status update:", status);

    // Convert API status to our enum
    let currentStatus: TransferStatus;
    switch (status.status) {
      case "COMPLETED":
      case "IN_FLIGHT":
        currentStatus = TransferStatus.COMPLETED;
        if (props.onSuccess) {
          props.onSuccess(status);
        }
        const client = zenobiaClient();
        if (client) {
          client.disconnect();
          setZenobiaClient(null);
        }
        break;
      case "FAILED":
        currentStatus = TransferStatus.FAILED;
        const failedClient = zenobiaClient();
        if (failedClient) {
          failedClient.disconnect();
          setZenobiaClient(null);
        }
        break;
      case "CANCELLED":
        currentStatus = TransferStatus.CANCELLED;
        const cancelledClient = zenobiaClient();
        if (cancelledClient) {
          cancelledClient.disconnect();
          setZenobiaClient(null);
        }
        break;
      default:
        currentStatus = TransferStatus.PENDING;
    }

    setTransferStatus(currentStatus);

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

  // Calculate discount amount or default to amount/100 if not provided
  const discountAmount = () =>
    props.discountAmount !== undefined
      ? props.discountAmount
      : Math.round(props.amount / 100);

  // Format cashback message based on amount
  const cashbackMessage = () => {
    const discount = discountAmount();
    if (discount < 1000) {
      // Less than $10 (in cents)
      const percentage = ((discount / props.amount) * 100).toFixed(0);
      return `✨ ${percentage}% cashback applied!`;
    } else {
      return `✨ Applied $${(discount / 100).toFixed(2)} cashback!`;
    }
  };

  return (
    <Show when={props.isOpen}>
      <div class="zenobia-qr-popup-overlay visible">
        <div class="zenobia-qr-popup-content">
          <button class="zenobia-qr-close" onClick={props.onClose}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <div class="modal-header">
            <div class="header-content">
              <h3>Pay by bank with Zenobia</h3>
              <p class="subtitle">Scan to complete your purchase</p>
            </div>
          </div>
          <div class="modal-body">
            <Show
              when={qrCodeObject() && props.transferRequestId}
              fallback={
                <div
                  class="qr-code-container"
                  style={{
                    width: props.qrCodeSize ? `${props.qrCodeSize}px` : "220px",
                    height: props.qrCodeSize
                      ? `${props.qrCodeSize}px`
                      : "220px",
                    display: "flex",
                    "justify-content": "center",
                    "align-items": "center",
                  }}
                >
                  <div
                    class="zenobia-qr-placeholder"
                    style={{
                      width: props.qrCodeSize
                        ? `${props.qrCodeSize}px`
                        : "220px",
                      height: props.qrCodeSize
                        ? `${props.qrCodeSize}px`
                        : "220px",
                    }}
                  />
                </div>
              }
            >
              <div
                class="qr-code-container"
                id="qrcode-container"
                ref={(el) => {
                  qrContainerRef.current = el;
                  const qrCode = qrCodeObject();
                  if (qrCode && el) {
                    // Clear any existing content
                    el.innerHTML = "";
                    qrCode.append(el);
                  }
                }}
                style={{
                  width: props.qrCodeSize ? `${props.qrCodeSize}px` : "220px",
                  height: props.qrCodeSize ? `${props.qrCodeSize}px` : "220px",
                  display: "flex",
                  "justify-content": "center",
                  "align-items": "center",
                }}
              ></div>
            </Show>
            <div class="payment-amount">${(props.amount / 100).toFixed(2)}</div>
            <div class="savings-badge">{cashbackMessage()}</div>
            <div class="payment-status">
              <div class="spinner"></div>
              <div class="payment-instructions">
                {!props.transferRequestId
                  ? "Preparing payment..."
                  : "Waiting for payment"}
              </div>
            </div>
            <Show when={error()}>
              <div class="zenobia-error">{error()}</div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};
