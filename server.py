'''
This python script is used to demostrate the process of signing s3 upload requests,
you can achieve the same feature with your perferred programming language.

http://docs.aws.amazon.com/AmazonS3/latest/dev/UsingRESTAPImpUpload.html

The server should return the result in JSON as such format

{
    'code':200,
    'result':{'url':'http://....', 'key':'1234567.jpg'}
}

but you can define your own result format
'''

import os
import hashlib
import hmac
import base64
import time
from urllib import quote

AWS_ACCESS_KEY = 'Your Aws Access Key'
AWS_ACCESS_SECRET = 'Your AWS Access Secret'

'''
Sign the query string,
please refer to offical AWS document:
http://docs.aws.amazon.com/AmazonS3/latest/dev/RESTAuthentication.html#RESTAuthenticationQueryStringAuth
'''
def sign(string_to_sign):
    return quote(base64.b64encode(hmac.new(AWS_ACCESS_SECRET, string_to_sign, hashlib.sha1).digest()))


'''
Do your own magic to generate unique file key here
'''
def get_file_key(file_name, expire):
    # convert file_name to lower case and get file extension
    file_name, file_extension = os.path.splitext(file_name.lower())

    return '%s-%d%s' % (file_name, expire, file_extension)


def sign_upload_init_request(bucket, file_name):

    # get expire time of 60 seconds
    expire = int(time.time()) + 60

    key = get_file_key(file_name, expire)

    # make string to sign
    string_to_sign = 'POST\n\n\n%d\n/%s/%s?uploads' % (expire, bucket, key)
    sig = sign(string_to_sign)

    url = 'http://%s.s3.amazonaws.com/%s?uploads&Signature=%s&Expires=%d&AWSAccessKeyId=%s' % (bucket, key, sig, expire, AWS_ACCESS_KEY)

    return url, key


def sign_file_upload_request(bucket, upload_id, number_of_parts):
    urls = []

    expire = int(time.time()) + 10800
    number_of_parts = int(number_of_parts)

    for part in range(1, number_of_parts + 1):
        string_to_sign = 'PUT\n\n\n%d\n/%s/%s?partNumber=%d&uploadId=%s' % (expire, bucket, key, part, upload_id)
        sig = cls.sign(string_to_sign)
        url = 'http://%s.s3.amazonaws.com/%s?partNumber=%d&uploadId=%s&Signature=%s&Expires=%d&AWSAccessKeyId=%s' % (bucket, key, part, upload_id, sig, expire, AWS_ACCESS_KEY)
        urls.append(url)

    return urls


def sign_upload_complete_request(bucket, key, upload_id):
    # get expire time stamp
    expire = int(time.time()) + 60

    string_to_sign = 'POST\n\ntext/plain; charset=UTF-8\n%d\n/%s/%s?uploadId=%s' % (expire, bucket, key, upload_id)
    sig = cls.sign(string_to_sign)
    url = 'http://%s.s3.amazonaws.com/%s?uploadId=%s&Signature=%s&Expires=%s&AWSAccessKeyId=%s' % (bucket, key, upload_id, sig, expire, AWS_ACCESS_KEY)

    return url


def sign_upload_abort_request(cls, account, key, upload_id):
    # get expire time stamp
    expire = int(time.time()) + 60

    string_to_sign = 'DELETE\n\n\n%d\n/%s/%s?uploadId=%s' % (expire, bucket, key, upload_id)
    sig = cls.sign(string_to_sign)
    url = 'http://%s.s3.amazonaws.com/%s?uploadId=%s&Signature=%s&Expires=%s&AWSAccessKeyId=%s' % (account.aws_s3_url, key, upload_id, sig, expire, settings.AWS_ACCESS_KEY)

    return url
