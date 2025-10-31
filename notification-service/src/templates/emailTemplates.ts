// templates/emailTemplates.ts
interface EmailTemplateData {
  verificationLink?: string;
  resetLink?: string;
  orderId?: string;
  status?: string;
  items?: Array<{
    productId: string;
    productName: string;
    productSku: string | null;
    quantity: number;
    unitPrice: string;
  }>;
  orderSummary?: {
    subtotal: number;
    shipping: number;
    tax: number;
    total: number;
  };
  requiresRefund?: boolean;
  reason?: string;
  paymentTransactionId?: string;
  amount?: number;
  message?: string;
}

class EmailTemplates {
  private baseTemplate(html: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
          .order-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .order-table th, .order-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
          .order-table th { background-color: #f8f9fa; }
          .total-row { font-weight: bold; background-color: #f8f9fa; }
          .success { color: #28a745; }
          .error { color: #dc3545; }
          .info { color: #17a2b8; }
        </style>
      </head>
      <body>
        <div class="container">
          ${html}
        </div>
      </body>
      </html>
    `;
  }

  verification(data: EmailTemplateData): string {
    return this.baseTemplate(`
      <h1>Welcome to Our E-Commerce Store! 🎉</h1>
      <p>We're excited to have you on board. To get started, please verify your email address by clicking the button below:</p>
      <p style="text-align: center;">
        <a href="${data.verificationLink}" class="button">Verify Your Account</a>
      </p>
      <p>Or copy and paste this link in your browser:</p>
      <p><code>${data.verificationLink}</code></p>
      <div class="footer">
        <p>If you didn't create an account, please ignore this email.</p>
        <p>This link will expire in 24 hours.</p>
      </div>
    `);
  }

  passwordReset(data: EmailTemplateData): string {
    return this.baseTemplate(`
      <h1>Reset Your Password</h1>
      <p>We received a request to reset your password. Click the button below to create a new password:</p>
      <p style="text-align: center;">
        <a href="${data.resetLink}" class="button">Reset Password</a>
      </p>
      <p>Or copy and paste this link in your browser:</p>
      <p><code>${data.resetLink}</code></p>
      <div class="footer">
        <p>If you didn't request a password reset, please ignore this email.</p>
        <p>This link will expire in 1 hour.</p>
      </div>
    `);
  }

  orderConfirmation(data: EmailTemplateData): string {
    const itemsHtml =
      data.items
        ?.map(
          (item) => `
      <tr>
        <td>${item.productName}</td>
        <td>${item.quantity}</td>
        <td>$${parseFloat(item.unitPrice).toFixed(2)}</td>
        <td>$${(parseFloat(item.unitPrice) * item.quantity).toFixed(2)}</td>
      </tr>
    `
        )
        .join("") || "";

    return this.baseTemplate(`
      <h1>Order Confirmation 🎉</h1>
      <p>Thank you for your order! We're excited to let you know that we've received your order and it's being processed.</p>
      
      <h3>Order Details</h3>
      <p><strong>Order ID:</strong> ${data.orderId}</p>
      <p><strong>Status:</strong> ${data.status}</p>
      
      <h3>Items Ordered</h3>
      <table class="order-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Quantity</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      
      <h3>Order Summary</h3>
      <table class="order-table">
        <tr>
          <td>Subtotal:</td>
          <td>$${data.orderSummary?.subtotal.toFixed(2)}</td>
        </tr>
        <tr>
          <td>Shipping:</td>
          <td>$${data.orderSummary?.shipping.toFixed(2)}</td>
        </tr>
        <tr>
          <td>Tax:</td>
          <td>$${data.orderSummary?.tax.toFixed(2)}</td>
        </tr>
        <tr class="total-row">
          <td><strong>Total:</strong></td>
          <td><strong>$${data.orderSummary?.total.toFixed(2)}</strong></td>
        </tr>
      </table>
      
      <div class="footer">
        <p>You can track your order status in your account dashboard.</p>
        <p>If you have any questions, please contact our support team.</p>
      </div>
    `);
  }

  orderCancellation(data: EmailTemplateData): string {
    const itemsHtml =
      data.items
        ?.map(
          (item) => `
      <tr>
        <td>${item.productName}</td>
        <td>${item.quantity}</td>
        <td>$${parseFloat(item.unitPrice).toFixed(2)}</td>
      </tr>
    `
        )
        .join("") || "";

    const refundNotice = data.requiresRefund
      ? `<p><strong>Refund Status:</strong> Your refund has been initiated and will be processed within 5-7 business days.</p>`
      : "";

    return this.baseTemplate(`
      <h1>Order Cancellation</h1>
      <p>Your order has been cancelled as requested.</p>
      
      <h3>Cancellation Details</h3>
      <p><strong>Order ID:</strong> ${data.orderId}</p>
      <p><strong>Status:</strong> ${data.status}</p>
      ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ""}
      ${refundNotice}
      
      <h3>Cancelled Items</h3>
      <table class="order-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Quantity</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      
      <div class="footer">
        <p>If this cancellation was a mistake or you have any questions, please contact our support team immediately.</p>
        <p>We hope to see you again soon!</p>
      </div>
    `);
  }

  paymentSuccess(data: EmailTemplateData): string {
    return this.baseTemplate(`
      <h1 class="success">Payment Successful! ✅</h1>
      <p>Your payment has been processed successfully. Thank you for your purchase!</p>
      
      <h3>Payment Details</h3>
      <p><strong>Order ID:</strong> ${data.orderId}</p>
      <p><strong>Transaction ID:</strong> ${data.paymentTransactionId}</p>
      <p><strong>Amount Paid:</strong> $${data.amount?.toFixed(2)}</p>
      ${data.message ? `<p><strong>Message:</strong> ${data.message}</p>` : ""}
      
      <div class="footer">
        <p>You will receive a separate order confirmation email with your order details.</p>
        <p>If you have any questions about your payment, please contact our support team.</p>
      </div>
    `);
  }

  paymentFailure(data: EmailTemplateData): string {
    return this.baseTemplate(`
      <h1 class="error">Payment Failed ❌</h1>
      <p>We were unable to process your payment. Please try again or use a different payment method.</p>
      
      <h3>Payment Details</h3>
      <p><strong>Order ID:</strong> ${data.orderId}</p>
      <p><strong>Payment ID:</strong> ${data.paymentTransactionId}</p>
      
      <div class="footer">
        <p>Your order has been placed on hold and will be processed once payment is successful.</p>
        <p>If you continue to experience issues, please contact our support team.</p>
      </div>
    `);
  }

  paymentRefunded(data: EmailTemplateData): string {
    return this.baseTemplate(`
      <h1 class="info">Payment Refunded 🔄</h1>
      <p>Your refund has been processed successfully.</p>
      
      <h3>Refund Details</h3>
      <p><strong>Transaction ID:</strong> ${data.paymentTransactionId}</p>
      <p><strong>Amount Refunded:</strong> $${data.amount?.toFixed(2)}</p>
      ${data.message ? `<p><strong>Message:</strong> ${data.message}</p>` : ""}
      ${
        data.orderId
          ? `<p><strong>Related Order ID:</strong> ${data.orderId}</p>`
          : ""
      }
      
      <div class="footer">
        <p>The refund may take 5-7 business days to appear in your account.</p>
        <p>If you have any questions about your refund, please contact our support team.</p>
      </div>
    `);
  }
}

export const emailTemplates = new EmailTemplates();
