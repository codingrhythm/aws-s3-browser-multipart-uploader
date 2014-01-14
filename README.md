aws-s3-browser-multipart-uploader
=================================

Upload large files in multipart from browser.

This implementation is heavily inspired by [s3-multipart-upload-browser](https://github.com/hridayeshgupta/s3-multipart-upload-browser).

# Browser Support

Browsers that support html5 file.slice API.

Chrome 6+, FF 4+, and IE 10+

# How to use

check `demo.html` file. And you may also want to change the S3FileManager.prototype.config settings in `s3_uploader.js`

# Server Implementation

The script need a server side code to sign the requests. So you need to do server implementation yourself and please check `server.py` for more details.
