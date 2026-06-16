package com.example.jala

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            WebViewScreen()
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebViewScreen() {
    AndroidView(
        modifier = Modifier.fillMaxSize().safeDrawingPadding(),
        factory = { context ->
            WebView(context).apply {
                // Enable JavaScript and storage APIs
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = true
                settings.allowContentAccess = true
                // Let the WebView honor the page's own <meta viewport> tag instead of
                // rendering at a fixed legacy desktop width.
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true
                // MIUI applies system font-scaling to WebViews, which breaks rem/em-based
                // layouts; pin text scale to the page's own CSS sizing.
                settings.textZoom = 100
                settings.builtInZoomControls = false
                settings.displayZoomControls = false
                settings.layoutAlgorithm = android.webkit.WebSettings.LayoutAlgorithm.TEXT_AUTOSIZING

                // Enable Chrome developer tools debugging
                WebView.setWebContentsDebuggingEnabled(true)

                // Attach Javascript interface bridge
                addJavascriptInterface(AndroidBridge(context), "Android")

                // Setup WebViewAssetLoader to serve local HTML/CSS/JS files
                val assetLoader = WebViewAssetLoader.Builder()
                    .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
                    .addPathHandler("/static/", WebViewAssetLoader.AssetsPathHandler(context))
                    .build()

                webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(
                        view: WebView?,
                        request: WebResourceRequest?
                    ): WebResourceResponse? {
                        if (request != null) {
                            val response = assetLoader.shouldInterceptRequest(request.url)
                            if (response != null) {
                                return response
                            }
                        }
                        return super.shouldInterceptRequest(view, request)
                    }
                }

                // Load page via asset loader domain
                loadUrl("https://appassets.androidplatform.net/assets/index.html")
            }
        }
    )
}
