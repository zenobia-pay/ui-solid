import { createSignal, Component, createEffect, Show, onMount } from "solid-js";
import { ZenobiaClient, StatementItem } from "@zenobia/client";
import QRCode from "qrcode";

export interface CreateTransferRequestResponse {
  transferRequestId: string;
  merchantId: string;
}

// Define the TransferStatus enum
export enum TransferStatus {
  PENDING = "PENDING",
  IN_FLIGHT = "IN_FLIGHT",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

interface ZenobiaPaymentButtonProps {
  amount: number;
  url: string; // Full URL to the payment endpoint
  statementItems?: StatementItem[]; // Optional statement items
  buttonText?: string;
  buttonClass?: string;
  qrCodeSize?: number;
  woodcutType?: "tree" | "z"; // Type of woodcut design
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
  const [qrCodeSvg, setQrCodeSvg] = createSignal<string | null>(null);
  const [transferStatus, setTransferStatus] = createSignal<TransferStatus>(
    TransferStatus.PENDING
  );
  const [error, setError] = createSignal<string | null>(null);
  const [rotateX, setRotateX] = createSignal<number>(20); // Default tilt of 20 degrees backward
  const [rotateY, setRotateY] = createSignal<number>(0);

  // Remove drag-related signals since we'll use sliders instead
  const [sliderFocused, setSliderFocused] = createSignal<boolean>(false);
  // The rose image URL - replace with actual URL to your image
  const roseImage =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cGF0aCBkPSJNNTAgMTBjLTUgMC0xMCAyLTE1IDVjLTMgMi01IDQtNyA3Yy0yIDQtMyA4LTIgMTJjMSA1IDQgMTAgOCAxNGMyIDIgNCAxIDYgMGMtMiAzLTQgNi00IDEwYzAgNSAyIDEwIDYgMTRjNCA0IDkgNiAxNCAwYy0xIDQtMSA4IDEgMTJjMyA1IDcgOCAxMyA5YzUtMSA5LTQgMTEtOWMyLTQgMi04IDEtMTJjNCA2IDkgNCAxMyAwYzQtNCA2LTkgNi0xNGMwLTQtMi03LTQtMTBjMiAxIDQgMiA2IDBjNC00IDctOSA4LTE0YzEtNCAwLTggMi0xMmMtMi0zLTQtNS03LTdjLTUtMy0xMC01LTE1LTVjLTIgMC0zIDEtNCAxYy0yIDAtNC0xLTYtMWMtMi0yLTUtMy04LTNjLTMgMC02IDEtOSAzYy0xIDAtMyAxLTYgMWMtMSAwLTItMS00LTFaIiBzdHlsZT0iZmlsbDpub25lO3N0cm9rZTojMDAwO3N0cm9rZS13aWR0aDoxIi8+PC9zdmc+";

  let qrCodeRef: HTMLDivElement | undefined;
  let verticalSliderRef: HTMLInputElement | undefined;
  let horizontalSliderRef: HTMLInputElement | undefined;
  let qrCanvasRef: HTMLCanvasElement | undefined;

  // Generate QR code
  createEffect(() => {
    const request = transferRequest();
    if (request?.transferRequestId && request?.merchantId) {
      const qrData = JSON.stringify({
        transferRequestId: request.transferRequestId,
        merchantId: request.merchantId,
        amount: props.amount,
        status: transferStatus(),
      });

      // Create a hybrid approach - transparent QR code overlaid on the rose image
      QRCode.toCanvas(qrCanvasRef, qrData, {
        errorCorrectionLevel: "H", // Highest error correction
        margin: 0, // Remove margin to fit better with the image
        width: props.qrCodeSize || 200,
        color: {
          dark: "#000000A0", // Semi-transparent black
          light: "#00000000", // Transparent background
        },
      })
        .then(() => {
          // The QR code is rendered directly to the canvas, which will be overlaid on the image
          // We don't need to set qrCodeSvg here, as we'll use a different approach
        })
        .catch((err) => {
          console.error("Error generating QR code:", err);
          setError("Failed to generate QR code");
        });
    }
  });

  // Handle vertical slider change
  const handleVerticalSliderChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    setRotateX(Number(target.value));
  };

  // Handle horizontal slider change
  const handleHorizontalSliderChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    setRotateY(Number(target.value));
  };

  // Set up event listeners for sliders
  onMount(() => {
    if (verticalSliderRef) {
      verticalSliderRef.addEventListener("input", handleVerticalSliderChange);
      verticalSliderRef.value = rotateX().toString();
    }

    if (horizontalSliderRef) {
      horizontalSliderRef.addEventListener(
        "input",
        handleHorizontalSliderChange
      );
      horizontalSliderRef.value = rotateY().toString();
    }

    // Clean up event listeners
    return () => {
      if (verticalSliderRef) {
        verticalSliderRef.removeEventListener(
          "input",
          handleVerticalSliderChange
        );
      }

      if (horizontalSliderRef) {
        horizontalSliderRef.removeEventListener(
          "input",
          handleHorizontalSliderChange
        );
      }
    };
  });

  // Function to update the transfer status - can be called when webhook data is received
  const updateTransferStatus = (status: string) => {
    // Convert API status to our enum
    let currentStatus: TransferStatus;
    switch (status) {
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
      // Initialize client with no parameters as per the updated implementation
      const client = new ZenobiaClient();

      // Create default statement item if none provided
      const statementItems = props.statementItems || [
        {
          name: "Payment",
          amount: props.amount,
        },
      ];

      // Call createTransferRequest with the full URL
      const transfer = (await client.createTransferRequest(
        props.url,
        props.amount,
        statementItems
      )) as unknown as {
        transferRequestId: string;
        merchantId: string;
      };

      // Store transfer request data
      setTransferRequest({
        transferRequestId: transfer.transferRequestId,
        merchantId: transfer.merchantId,
      });

      setShowQR(true);
      setLoading(false);

      if (props.onSuccess) {
        props.onSuccess({
          transferRequestId: transfer.transferRequestId,
          merchantId: transfer.merchantId,
        });
      }
    } catch (error) {
      setLoading(false);
      setError(error instanceof Error ? error.message : "An error occurred");

      if (props.onError && error instanceof Error) {
        props.onError(error);
      }
    }
  };

  return (
    <Show
      when={!showQR()}
      fallback={
        <div class="flex flex-col items-center">
          <Show
            when={transferRequest()}
            fallback={
              <div class="w-48 h-48 flex items-center justify-center">
                <span class="loading">Generating artistic code...</span>
              </div>
            }
          >
            <div class="card bg-base-100 shadow-sm">
              <div class="card-body p-4 items-center">
                <div class="flex items-center gap-4">
                  {/* Vertical Slider for X-axis rotation */}
                  <div class="flex flex-col items-center">
                    <div class="text-xs mb-1">↕</div>
                    <input
                      ref={verticalSliderRef}
                      type="range"
                      min="-30"
                      max="30"
                      step="1"
                      class="range range-xs range-primary h-48"
                      style={{
                        "writing-mode":
                          "vertical-lr" /* Standard CSS writing mode */,
                        "-webkit-appearance": "slider-vertical" /* WebKit */,
                        width: "20px",
                        height: `${props.qrCodeSize || 200}px`,
                      }}
                    />
                  </div>

                  {/* QR Code with 3D Transform */}
                  <div
                    class="relative perspective-container"
                    style={{
                      perspective: "1000px",
                      width: `${props.qrCodeSize || 200}px`,
                      height: `${props.qrCodeSize || 200}px`,
                    }}
                  >
                    <div
                      ref={qrCodeRef}
                      class="qr-code-wrapper w-full h-full"
                      style={{
                        transform: `rotateX(${rotateX()}deg) rotateY(${rotateY()}deg)`,
                        "transform-style": "preserve-3d",
                        transition: "transform 0.1s ease",
                        "box-shadow": "0 4px 10px rgba(0,0,0,0.2)",
                        "background-color": "#ffffff",
                        position: "relative",
                      }}
                    >
                      {/* Rose image as background */}
                      <img
                        src={roseImage}
                        alt="Woodcut Rose"
                        style={{
                          position: "absolute",
                          top: "0",
                          left: "0",
                          width: "100%",
                          height: "100%",
                          "object-fit": "contain",
                        }}
                      />

                      {/* Canvas for QR code overlay */}
                      <canvas
                        ref={qrCanvasRef}
                        style={{
                          position: "absolute",
                          top: "0",
                          left: "0",
                          width: "100%",
                          height: "100%",
                          "mix-blend-mode": "multiply",
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Horizontal Slider for Y-axis rotation */}
                <div class="mt-4 flex items-center gap-2">
                  <div class="text-xs">←</div>
                  <input
                    ref={horizontalSliderRef}
                    type="range"
                    min="-30"
                    max="30"
                    step="1"
                    class="range range-xs range-primary"
                    style={{
                      width: `${props.qrCodeSize || 200}px`,
                    }}
                  />
                  <div class="text-xs">→</div>
                </div>

                <p class="text-xs opacity-70 text-center mt-4">
                  Scan to verify transfer details
                  <br />
                  <span class="text-xs italic">
                    Use sliders to adjust angle for optimal scanning
                  </span>
                </p>
                <div class="mt-3">
                  <div class={`badge ${getBadgeClass()} gap-2`}>
                    <span>Status: {transferStatus() || "Waiting"}</span>
                  </div>
                </div>
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
        class={`zenobia-payment-button ${props.buttonClass || ""}`}
        onClick={handleClick}
        disabled={loading()}
      >
        {loading()
          ? "Processing..."
          : props.buttonText || `Pay ${props.amount}`}
      </button>
    </Show>
  );
};
