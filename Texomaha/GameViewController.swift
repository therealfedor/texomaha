//
//  GameViewController.swift
//  Texomaha
//
//  Created by Dan Goldstein on 9/2/26.
//

import UIKit
import WebKit

final class GameViewController: UIViewController, WKNavigationDelegate {
    private let statusLabel = UILabel()
    private lazy var webView: WKWebView = {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = self
        view.allowsBackForwardNavigationGestures = true
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.scrollView.bounces = false
        view.scrollView.pinchGestureRecognizer?.isEnabled = false
        view.translatesAutoresizingMaskIntoConstraints = false
        return view
    }()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.03, green: 0.04, blue: 0.05, alpha: 1.0)
        configureWebView()
        configureStatusLabel()
        loadTexomaha()
    }

    private func configureWebView() {
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func configureStatusLabel() {
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.numberOfLines = 0
        statusLabel.textAlignment = .center
        statusLabel.textColor = .white
        statusLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        statusLabel.text = "Loading Texomaha..."
        view.addSubview(statusLabel)
        NSLayoutConstraint.activate([
            statusLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 28),
            statusLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -28),
            statusLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    private func loadTexomaha() {
        guard let url = texomahaWebAppURL else {
            showLaunchMessage("Set TexomahaWebAppURL in Info.plist to your deployed Texomaha web app URL.")
            return
        }

        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        webView.load(request)
    }

    private var texomahaWebAppURL: URL? {
        let configured = Bundle.main.object(forInfoDictionaryKey: "TexomahaWebAppURL") as? String
        let value = configured?.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.flatMap(URL.init(string:))
    }

    private func showLaunchMessage(_ message: String) {
        statusLabel.text = message
        statusLabel.isHidden = false
        webView.isHidden = true
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        statusLabel.isHidden = true
        webView.isHidden = false
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showLaunchMessage("Texomaha is ready, but the web server is not reachable.\n\nStart it with:\ncd web\nPATH=/usr/local/bin:$PATH TEXOMAHA_JWT_SECRET=dev-secret npm start")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showLaunchMessage("Texomaha is ready, but the web server is not reachable.\n\nStart it with:\ncd web\nPATH=/usr/local/bin:$PATH TEXOMAHA_JWT_SECRET=dev-secret npm start")
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        if UIDevice.current.userInterfaceIdiom == .phone {
            return .allButUpsideDown
        }
        return .all
    }

    override var prefersStatusBarHidden: Bool {
        true
    }
}
