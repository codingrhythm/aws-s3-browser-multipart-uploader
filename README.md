aws-s3-browser-multipart-uploader
=================================

Upload large files in multipart from browser.

This implementation is heavily inspired by [s3-multipart-upload-browser](https://github.com/hridayeshgupta/s3-multipart-upload-browser).

# Features

1. Multi-parts upload, files are sliced into chunks and uploaded separately. So the uploading progress can be paused and resumed. If one chunk is fail, it can be retried later without failing the whole file upload.

2. Multi file upload support, files can be uploaded concurrently. So small files don't need to wait for the large files to complete the upload.

3. Smooth progress bar. The upload progress can be captured to byte level. So a smooth upload progress bar can be implemented.


# Browser Support

Browsers that support html5 file.slice API.

Chrome 6+, FF 4+, and IE 10+

# How to use

check `demo.html` file. And you may also want to change the `S3FileManager.prototype.config` settings in `s3_uploader.js`

You also need to update your bucket CORS settings like this:

```
<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <CORSRule>
        <AllowedOrigin>yourdomain.com</AllowedOrigin>
        <AllowedMethod>GET</AllowedMethod>
        <AllowedMethod>POST</AllowedMethod>
        <AllowedMethod>PUT</AllowedMethod>
        <AllowedMethod>DELETE</AllowedMethod>
        <MaxAgeSeconds>3000</MaxAgeSeconds>
        <ExposeHeader>Etag</ExposeHeader>
        <AllowedHeader>*</AllowedHeader>
    </CORSRule>
</CORSConfiguration>
```

# Server Implementation

The script need a server side code to sign the requests. So you need to do server implementation yourself and please check `server.py` for more details.
