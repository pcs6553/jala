package com.example.jala

import android.content.Context
import android.content.Intent
import android.os.Environment
import android.util.Base64
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

class AndroidBridge(private val context: Context) {
    private val apiRouter = ApiRouter(context)

    @JavascriptInterface
    fun apiCall(url: String, method: String, body: String, headersJson: String): String {
        return apiRouter.handleRequest(url, method, body)
    }

    @JavascriptInterface
    fun savePdf(filename: String, pdfBase64: String) {
        try {
            // Clean base64 string
            val cleanBase64 = if (pdfBase64.contains(",")) {
                pdfBase64.substring(pdfBase64.indexOf(",") + 1)
            } else {
                pdfBase64
            }

            // Decode bytes
            val pdfBytes = Base64.decode(cleanBase64, Base64.DEFAULT)

            // Save to app external files directory (Downloads subdirectory)
            val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
            if (dir != null && !dir.exists()) {
                dir.mkdirs()
            }
            val file = File(dir, filename)
            FileOutputStream(file).use { fos ->
                fos.write(pdfBytes)
            }

            // Show confirmation toast
            Toast.makeText(context, "Invoice saved: $filename", Toast.LENGTH_LONG).show()

            // Open/View the PDF
            val fileUri = FileProvider.getUriForFile(
                context,
                "com.example.jala.fileprovider",
                file
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(fileUri, "application/pdf")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            val chooser = Intent.createChooser(intent, "Open Invoice").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(chooser)

        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(context, "Error saving invoice: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
}
