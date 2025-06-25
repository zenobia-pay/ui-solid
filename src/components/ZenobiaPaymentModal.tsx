import {
  Component,
  createSignal,
  createEffect,
  onCleanup,
  Show,
} from "solid-js";
import { ZenobiaClient } from "@zenobia/client";
import QRCodeStyling from "qr-code-styling";
import {
  TransferStatus,
  CreateTransferRequestResponse,
} from "./ZenobiaPaymentButton";

interface ClientTransferStatus {
  status: string;
  [key: string]: any;
}

interface ZenobiaPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  discountAmount?: number;
  qrCodeSize?: number;
  isTest?: boolean;
  url?: string;
  metadata?: Record<string, any>;
  transferRequest?: CreateTransferRequestResponse;
  onSuccess?: (
    response: CreateTransferRequestResponse,
    status: ClientTransferStatus
  ) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: TransferStatus) => void;
}

// Utility function to detect mobile devices
const isMobile = (): boolean => {
  if (typeof window === "undefined") return false;

  const userAgent = window.navigator.userAgent.toLowerCase();

  // Check for mobile devices
  const isMobileDevice =
    /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent
    );

  // Check for touch capability
  const hasTouchScreen =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  // Check screen size (mobile typically has smaller screens)
  const isSmallScreen = window.innerWidth <= 768;

  return isMobileDevice || (hasTouchScreen && isSmallScreen);
};

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
  const [transferRequest, setTransferRequest] =
    createSignal<CreateTransferRequestResponse | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [qrCodeUrl, setQrCodeUrl] = createSignal<string>("");

  // Initialize WebSocket connection when modal opens
  createEffect(() => {
    if (props.isOpen && !zenobiaClient()) {
      const client = new ZenobiaClient(props.isTest);
      setZenobiaClient(client);

      if (props.transferRequest) {
        // If we have a transfer request, just listen to it
        setTransferRequest(props.transferRequest);
        client.listenToTransfer(
          props.transferRequest.transferRequestId,
          props.transferRequest.signature || "",
          handleStatusUpdate,
          handleWebSocketError,
          handleConnectionChange
        );
      } else if (props.url) {
        // If we have a URL, create a new transfer
        setIsLoading(true);
        setError(null);

        const metadata = props.metadata || {
          amount: props.amount,
          statementItems: {
            name: "Payment",
            amount: props.amount,
          },
        };

        client
          .createTransfer(props.url, metadata)
          .then((transfer) => {
            setTransferRequest({
              transferRequestId: transfer.transferRequestId,
              merchantId: transfer.merchantId,
              expiry: transfer.expiry,
              signature: transfer.signature,
            });

            // Listen to the transfer status
            client.listenToTransfer(
              transfer.transferRequestId,
              transfer.signature || "",
              handleStatusUpdate,
              handleWebSocketError,
              handleConnectionChange
            );
          })
          .catch((error) => {
            setError(
              error instanceof Error ? error.message : "An error occurred"
            );
            if (props.onError && error instanceof Error) {
              props.onError(error);
            }
          })
          .finally(() => {
            setIsLoading(false);
          });
      } else {
        setError("No URL provided for creating a new transfer");
      }
    }
  });

  // Generate QR code when transfer request is created
  createEffect(() => {
    if (transferRequest()?.transferRequestId) {
      const transferIdNoDashes = transferRequest()!.transferRequestId.replace(
        /-/g,
        ""
      );
      const base64TransferId = btoa(transferIdNoDashes)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      let qrString = `https://zenobiapay.com/clip?id=${base64TransferId}`;

      if (props.isTest) {
        qrString += "&type=test";
      }

      // Store the QR code URL for the mobile button
      setQrCodeUrl(qrString);

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
        if (props.onSuccess && transferRequest()) {
          props.onSuccess(transferRequest()!, status);
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
              <Show when={props.isTest}>
                <div class="test-mode-badge" tabindex="0">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle
                      cx="10"
                      cy="10"
                      r="9"
                      stroke="#b45309"
                      stroke-width="2"
                      fill="#fef3c7"
                    />
                    <text
                      x="10"
                      y="15"
                      text-anchor="middle"
                      font-size="12"
                      fill="#b45309"
                      font-family="Arial"
                      font-weight="bold"
                    >
                      i
                    </text>
                  </svg>
                  <span class="test-mode-badge-text">Test Mode</span>
                  <div class="test-mode-tooltip">
                    Test Mode: No real money will be moved.
                  </div>
                </div>
              </Show>
            </div>
          </div>
          <div class="modal-body">
            <Show
              when={!isMobile() && qrCodeUrl() !== ""}
              fallback={
                <Show
                  when={qrCodeObject() && transferRequest()}
                  fallback={
                    <div
                      class="qr-code-container"
                      style={{
                        width: props.qrCodeSize
                          ? `${props.qrCodeSize}px`
                          : "220px",
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
                      width: props.qrCodeSize
                        ? `${props.qrCodeSize}px`
                        : "220px",
                      height: props.qrCodeSize
                        ? `${props.qrCodeSize}px`
                        : "220px",
                      display: "flex",
                      "justify-content": "center",
                      "align-items": "center",
                    }}
                  ></div>
                </Show>
              }
            >
              <div
                class="mobile-button-container"
                style={{ "text-align": "center", margin: "20px 0" }}
              >
                <button
                  class="mobile-button"
                  onClick={() => window.open(qrCodeUrl(), "_blank")}
                  title="Open on mobile device"
                  style={{
                    "background-color": "#000",
                    color: "#fff",
                    border: "none",
                    padding: "16px 24px",
                    "border-radius": "8px",
                    "font-size": "16px",
                    "font-weight": "500",
                    cursor: "pointer",
                    display: "flex",
                    "align-items": "center",
                    gap: "8px",
                    margin: "0 auto",
                    transition: "background-color 0.2s ease",
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12" y2="18" />
                  </svg>
                  <span>Open app to continue</span>
                </button>
              </div>
            </Show>
            <div class="payment-amount">${(props.amount / 100).toFixed(2)}</div>
            <div class="savings-badge">{cashbackMessage()}</div>
            <div class="payment-status">
              <div class="spinner"></div>
              <div class="payment-instructions">
                {isLoading()
                  ? "Preparing payment..."
                  : !transferRequest()
                  ? "Creating payment..."
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
