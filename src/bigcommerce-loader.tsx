import { render } from "solid-js/web";
import {
  QrPosition,
  ZenobiaPaymentButton,
} from "./components/ZenobiaPaymentButton";
import type {
  CreateTransferRequestResponse,
  TransferStatus,
} from "./components/ZenobiaPaymentButton";

type InitOpts = {
  amount: number;
  target: string | HTMLElement;
  metadata: Record<string, any>;
  url: string;
  buttonText?: string;
  buttonClass?: string;
  qrCodeSize?: number;
  onSuccess?: (res: CreateTransferRequestResponse) => void;
  onError?: (err: Error) => void;
  onStatusChange?: (status: TransferStatus) => void;
};

function loadBigCommerceSDK(): Promise<any> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout-sdk.bigcommerce.com/v1/loader.js";
    script.onload = async () => {
      try {
        const module = await (window as any).checkoutKitLoader.load(
          "checkout-sdk"
        );
        resolve(module);
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

function waitForCheckoutStep(): Promise<void> {
  return new Promise((resolve) => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target as HTMLElement;
        if (
          target.classList.contains("checkout-step--payment") &&
          target.querySelector(".checkout-view-content")
        ) {
          observer.disconnect();
          resolve();
          return;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  });
}

async function initZenobiaPayBigcommerce(opts: InitOpts) {
  try {
    // Wait for the checkout step to be ready
    await waitForCheckoutStep();

    // Load BigCommerce SDK
    const module = await loadBigCommerceSDK();
    const service = module.createCheckoutService();
    await service.loadCheckout();

    const checkout = service.getState().data.getCheckout();
    console.log("checkoutId:", checkout?.id);
    console.log("email:", checkout?.billingAddress?.email);
    console.log("items:", checkout);

    // Add Zenobia Pay to payment methods list
    const paymentMethodsList = document.querySelector(
      ".form-checklist.optimizedCheckout-form-checklist"
    );
    if (paymentMethodsList) {
      const zenobiaPayOption = document.createElement("li");
      zenobiaPayOption.className =
        "form-checklist-item optimizedCheckout-form-checklist-item";
      zenobiaPayOption.innerHTML = `
        <div class="form-checklist-header">
          <div class="form-field">
            <input id="radio-zenobiapay" type="radio" class="form-checklist-checkbox optimizedCheckout-form-checklist-checkbox" name="paymentProviderRadio" value="zenobiapay">
            <label for="radio-zenobiapay" class="form-label optimizedCheckout-form-label">
              <div class="paymentProviderHeader-container">
                <div class="paymentProviderHeader-nameContainer" data-test="payment-method-zenobiapay">
                  <div aria-level="6" class="paymentProviderHeader-name" data-test="payment-method-name" role="heading">Pay with your phone with Zenobia Pay</div>
                </div>
              </div>
            </label>
          </div>
        </div>
      `;
      paymentMethodsList.appendChild(zenobiaPayOption);

      // Add event listener to handle payment method selection
      const radioButtons = paymentMethodsList.querySelectorAll(
        'input[name="paymentProviderRadio"]'
      );
      radioButtons.forEach((radio) => {
        radio.addEventListener("change", (e) => {
          const target = e.target as HTMLInputElement;
          const formActions = document.querySelector(".form-actions");
          if (!formActions) return;

          if (target.value === "zenobiapay") {
            // Hide all form actions except Zenobia Pay button
            const allFormActions = formActions.querySelectorAll(
              "*:not(.zenobia-pay-button-container)"
            );
            allFormActions.forEach((element) => {
              (element as HTMLElement).style.display = "none";
            });

            // Show Zenobia Pay button when selected
            const existingButton = formActions.querySelector(
              ".zenobia-pay-button-container"
            );
            if (!existingButton) {
              const buttonContainer = document.createElement("div");
              buttonContainer.className = "zenobia-pay-button-container";
              formActions.insertBefore(buttonContainer, formActions.firstChild);

              // Add checkout data to metadata
              const enhancedMetadata = {
                ...opts.metadata,
                checkoutId: checkout?.id,
                customerEmail: checkout?.billingAddress?.email,
              };

              render(
                () => (
                  <ZenobiaPaymentButton
                    url={opts.url}
                    amount={opts.amount}
                    metadata={enhancedMetadata}
                    buttonText={opts.buttonText}
                    buttonClass={opts.buttonClass}
                    qrCodeSize={opts.qrCodeSize}
                    onSuccess={(transferRequest, status) => {
                      // Handle success and redirect
                      const signature = transferRequest.signature;
                      const transferRequestId =
                        transferRequest.transferRequestId;
                      window.location.href = `https://order-confirmation-9bg.pages.dev/checkout/order-confirmation?signature=${signature}&transferRequestId=${transferRequestId}&returnUrl=${window.location.hostname}`;
                    }}
                    onError={opts.onError}
                    onStatusChange={opts.onStatusChange}
                    qrPosition={QrPosition.POPUP}
                  />
                ),
                buttonContainer
              );
            }
          } else {
            // Show all form actions again
            const allFormActions = formActions.querySelectorAll("*");
            allFormActions.forEach((element) => {
              (element as HTMLElement).style.display = "";
            });

            // Remove Zenobia Pay button when another payment method is selected
            const existingButton = document.querySelector(
              ".zenobia-pay-button-container"
            );
            if (existingButton) {
              existingButton.remove();
            }
          }
        });
      });
    }

    // Initially hide the Zenobia Pay button container
    const formActions = document.querySelector(".form-actions");
    if (formActions) {
      const zenobiaPayContainer = formActions.querySelector(
        ".zenobia-pay-button-container"
      );
      if (zenobiaPayContainer) {
        (zenobiaPayContainer as HTMLElement).style.display = "none";
      }
    }
  } catch (error) {
    console.error("[zenobia-pay] Error initializing payment:", error);
    opts.onError?.(error as Error);
  }
}

// Auto-initialize when script loads
(function () {
  // Default configuration
  const defaultConfig: InitOpts = {
    amount: 0,
    target: ".zenobia-pay-button-container",
    metadata: {},
    url: "https://dashboard.zenobiapay.com/bigcommerce/create-transfer",
    buttonText: "Zenobia Pay",
    buttonClass: "button button--primary button--large button--slab",
  };

  // Start initialization
  initZenobiaPayBigcommerce(defaultConfig);
})();

(window as any).ZenobiaPay = { init: initZenobiaPayBigcommerce };
