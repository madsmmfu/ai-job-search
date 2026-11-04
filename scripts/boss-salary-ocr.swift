import Foundation
import Vision
import ImageIO

// Screenshot bytes enter through stdin and are never persisted or sent away.
let data = FileHandle.standardInput.readDataToEndOfFile()
guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { exit(1) }
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: image).perform([request])
let rows: [[String: Any]] = (request.results ?? []).compactMap { observation in
    guard let text = observation.topCandidates(1).first else { return nil }
    let rect = observation.boundingBox
    return ["text": text.string, "confidence": text.confidence,
            "x": rect.minX, "y": 1 - rect.maxY,
            "width": rect.width, "height": rect.height]
}
let output = try JSONSerialization.data(withJSONObject: rows)
FileHandle.standardOutput.write(output)
