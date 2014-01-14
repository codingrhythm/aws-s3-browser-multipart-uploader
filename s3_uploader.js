/*
S3 multipart uploader javascript code
by Zack Zhu
*/

function FileChunk(id, data, file){
    var MAX_CHUNK_RETRIES = 2;
    var STATUS_MAPPTING = ['Pending', 'Uploading', 'Uploaded', 'Failed'];
    this.id = id;
    this.data = data;
    this.size = data.size;
    this.number_of_tries = 0;
    this.status = 0;
    this.upload_url = null;
    this.on_chunk_status_change = null;
    this.on_uploading = null;
    this.etag = null;
    this.jqXHR = null;
    this.uploaded_size = 0;
    this.file = file;

    var self = this;

    this.change_status = function(new_status, silent){
        if (self.status == new_status) return;
        self.status = new_status;

        if (silent === false){
            if (self.is_processed()) self.file.manager.free_up_queue();

            self.on_chunk_status_change(self);
        }
    }

    this.is_processed = function(){
        return self.status == (self.consts.UPLOADED || self.consts.FAILED);
    }

    this.upload = function(){
        if (self.status != self.consts.PENDING) return false;
        
        // check if this chunk has been tried many times
        if (self.number_of_tries >= MAX_CHUNK_RETRIES){
            // mark this chunk as failed
            self.change_status(self.consts.FAILED, false);
            return false;
        }

        // check if we have more spaces to upload this chunk
        if (self.file.manager.request_chunk_upload() === 0) return false;

        self.change_status(self.consts.UPLOADING, false);
        self.number_of_tries ++;
        self.jqXHR = $.ajax({
            type: 'PUT',
            url:  self.upload_url,
            data: self.data,
            processData: false,
            contentType: false,
            xhr: function(){
                
                if(window.ActiveXObject){
                    return new window.ActiveXObject("Microsoft.XMLHTTP");
                }else{
                    var xhr = new window.XMLHttpRequest();
                    //Upload progress
                    xhr.upload.addEventListener("progress", function(e){
                        if (e.lengthComputable) {
                            self.uploaded_size = e.loaded;
                            self.on_uploading();
                        }
                    }, false);

                    return xhr;
                }
            }
        }).done(function(result, status, jqXHR) {
            self.etag = jqXHR.getResponseHeader('Etag').replace(/"/g,'');
            self.change_status(self.consts.UPLOADED, false);
            self.uploaded_size = self.size;
            self.on_uploading();
        }).fail(function() {
            self.change_status(self.consts.PENDING, false);
        }).always(function() {
            self.jqXHR = null;
        });

        return true;
    }

    this.cancel = function(){
        if (self.status != self.consts.UPLOADING) return;

        self.change_status(self.consts.PENDING, true);
        self.jqXHR.abort();
        self.uploaded_size = 0;
        self.on_uploading();
    }
}

FileChunk.prototype.consts = {
    PENDING:   0,
    UPLOADING: 1,
    UPLOADED:  2,
    FAILED:    3
}

function S3File(file, manager){
    // const vars
    var STATUS_MAPPTING = ['Ready to Upload', 'Initializing', 'Uploading', 'Done', 'Failed', 'Cancelled', 'Paused'];
    var CHUNK_SIZE = 5 * 1024 * 1024;

    // instance vars
    this.file = file;
    this.id = null;
    this.name = file.name;
    this.size = file.size;
    this.uploaded_size = 0;
    this.status = 0;
    this.upload_id = null;
    this.key = null;
    this.element = null;
    this.upload_request_url = null;
    this.upload_cancel_url = null;
    this.upload_complete_url = null;
    this.chunks = [];
    this.number_of_chunks = 1;
    this.on_file_upload_progress_change = null;
    this.percent = 0;
    this.manager = manager;

    var self = this;

    // get number of chunks
    this.chunk = function(){
        self.number_of_chunks = Math.ceil(self.size / CHUNK_SIZE);
        self.chunks = [];

        var start = 0;
        var end = 0;
        for (var i = 0; i < self.number_of_chunks; i++){
            start = CHUNK_SIZE * i;
            end = Math.min(start + CHUNK_SIZE, file.size);
            var chunk = new FileChunk(i, self.file.slice(start, end), self);
            chunk.on_chunk_status_change = self.handle_chunk_status_change;
            chunk.on_uploading = self.handle_chunk_uploading;
            self.chunks.push(chunk);
        }
    }

    this.change_status = function(new_status){
        if (self.status == new_status) return;
        self.status = new_status;
        self.render();
    }

    this.handle_chunk_status_change = function(chunk){
        switch (chunk.status){
            case 0:
            // changed to pending
            return;

            case 1:
            // changed to uploading
            break;

            case 2:
            // changed to done
            break;

            case 3:
                // sad thing happened, clear queue, and stop everything
                self.change_status(self.consts.FAILED);
                self.cancel_upload();
            return;
        }

        self.process_queue();
    }

    this.handle_chunk_uploading = function(){
        self.uploaded_size = 0;
        for (var i in self.chunks){
            self.uploaded_size += self.chunks[i].uploaded_size;
        }
        var new_percent = parseInt((self.uploaded_size*100)/self.size);

        if (new_percent == self.percent) return;
        self.percent = new_percent;

        self.element.find('.status').html(self.status_display());
        self.on_file_upload_progress_change();
    }

    // render into html
    this.render = function(){
        var new_element = $('<tr><td>'+self.name+'</td><td>'+self.size_display()+'</td><td class="status">'+self.status_display()+'</td></tr>');

        if (self.element != null){
            self.element.replaceWith(new_element);
        }

        self.element = new_element;

        return self.element;
    }

    this.size_display = function(){
        var units = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        var kilo = 1024;
        var unit = 0;

        for (var i = 0; i < units.length; i++){
            if (self.size < Math.pow(kilo, i+1))
            {
                unit = i;
                break;
            }
        }

        var size = (self.size / Math.pow(kilo, unit)).toFixed(1);

        return size+' '+units[unit];
    }

    this.status_display = function(){
        
        var result = STATUS_MAPPTING[self.status];

        // draw percentage for the uploading file
        if (self.status == self.consts.UPLOADING){
            result += ' ('+self.percent+'%)';
        }

        return result;
    }

    this.is_processed = function(){
        return self.status == (self.consts.DONE || self.status == self.consts.CANCELLED || self.status == self.consts.FAILED);
    }

    this.start_upload = function(){
        if (self.is_processed()) return false;

        if (self.status == self.consts.PAUSED){
            // this file was paused during uploading, resume the uploading again
            self.change_status(self.consts.UPLOADING);
            self.process_queue();
            return true;
        }

        // check if this file has already being processed
        if (self.status != self.consts.READY_TO_UPLOAD) return false;

        // sign the request from server
        var data = {};
        data['file_name'] = self.name;
        data['folder_id'] = folder_id;
        $.ajax({
            type: 'POST',
            url:  S3FileManager.config.SIGN_UPLOAD_INIT_REQUEST_URL,
            data: data
        }).done(function(result) {
            if (result.code == 200){
                self.change_status(self.consts.INITIALIZING);
                self.key = result.result.key;
                self.upload_request_url = result.result.url;
                self.init_upload();
            }else{
                self.change_status(self.consts.FAILED);
            }
            
        }).fail(function() {
            self.change_status(self.consts.FAILED);
        }).always(function() {});

        return true;
    }

    this.init_upload = function(){
        var data = {};
        $.ajax({
            type: 'POST',
            url:  self.upload_request_url,
            data: data
        }).done(function(result) {
            self.upload_id = $(result).find('UploadId').html();
            self.prepare_upload();
        }).fail(function(jqXHR, textStatus, errorThrown) {
            self.change_status(self.consts.FAILED);
        }).always(function() {});
    }

    this.prepare_upload = function(){
        var data = {};
        data.upload_id = self.upload_id;
        data.key = self.key;
        data.number_of_chunks = self.number_of_chunks;
        $.ajax({
            type: 'POST',
            url:  S3FileManager.config.SIGN_FILE_UPLOAD_REQUEST_URL,
            data: data
        }).done(function(result) {
            if (result.code == 200){
                var upload_file_urls = result.result;
                for (var i = 0; i < self.chunks.length; i++){
                    self.chunks[i].upload_url = upload_file_urls[i];
                }
                self.queue_size = 0;
                self.change_status(self.consts.UPLOADING);
                self.process_queue();
            }else{
                self.change_status(self.consts.FAILED);
            }
        }).fail(function() {
            self.change_status(self.consts.FAILED);
        }).always(function() {});
    }

    this.process_queue = function(){
        // check if upload has been cancelled
        if (self.status == self.consts.CANCELLED) return;

        // check if we have more chunks to upload
        var all_done = true;
        for (var i in self.chunks){
            var chunk = self.chunks[i];
            
            // check if the chunk is available to upload
            if (chunk.upload() === true) return;

            if (!chunk.is_processed()) all_done = false;
        }

        // we are processing all chunks here
        if (all_done){
            // we have process all chunks, mission completed
            self.complete_upload();
        }else{
            self.manager.process_upload();
        }
    }

    this.complete_upload = function(){
        var data = {};
        data.upload_id = self.upload_id;
        data.key = self.key;
        $.ajax({
            type: 'POST',
            url:  S3FileManager.config.SIGN_UPLOAD_COMPLETE_REQUEST_URL,
            data: data
        }).done(function(result) {
            if (result.code == 200){
                self.upload_complete_url = result.result;
                self.finish_upload();
            }else{
                self.change_status(self.consts.FAILED);
            }
            
        }).fail(function() {
            self.change_status(self.consts.FAILED);
        }).always(function() {});
    }

    this.finish_upload = function(){
        var data = '<CompleteMultipartUpload>';
        for (var i = 0; i < self.chunks.length; i++){
            data += '<Part><PartNumber>'+(i+1)+'</PartNumber><ETag>'+self.chunks[i].etag+'</ETag></Part>';
        }
        data += '</CompleteMultipartUpload>';

        $.ajax({
            type: 'POST',
            url:  self.upload_complete_url,
            processData: false,
            contentType: 'text/plain; charset=UTF-8',
            data: data
        }).done(function(result) {
            self.change_status(self.consts.DONE);
            self.manager.process_upload();
        }).fail(function() {
            self.change_status(self.consts.FAILED);
        }).always(function() {});
    }

    this.cancel_upload = function(){
        var data = {};
        data.upload_id = self.upload_id;
        data.key = self.key;
        self.pause_upload();
        self.chunks = [];
        self.queue_size = 0;
        $.ajax({
            type: 'POST',
            url:  S3FileManager.config.SIGN_UPLOAD_ABORT_REQUEST_URL,
            data: data
        }).done(function(result) {
            if (result.code == 200){
                self.upload_cancel_url = result.result;
                self.abort_upload();
            }else{
                self.change_status(self.consts.FAILED);
            }
        }).fail(function() {
            self.change_status(self.consts.FAILED);
        }).always(function() {});
    }

    this.abort_upload = function(){
        var data = {};
        $.ajax({
            type: 'DELETE',
            url:  self.upload_cancel_url,
            processData: false,
            contentType: false
        }).done(function(result) {
        }).fail(function() {
        }).always(function() {
            if (self.status == self.consts.FAILED) return;
            self.change_status(self.consts.CANCELLED);
        });   
    }

    this.pause_upload = function(){
        if (self.is_processed()) return;

        self.queue_size = 0;
        if (self.status == self.consts.UPLOADING){
            // try to pause all chunks
            for (var i in self.chunks){
                self.chunks[i].cancel();
            }
            self.change_status(self.consts.PAUSED);
        }else{
            self.change_status(self.consts.READY_TO_UPLOAD);
        }
        
    }
}

S3File.prototype.consts = {
    READY_TO_UPLOAD:  0,
    INITIALIZING:     1,
    UPLOADING:        2,
    DONE:             3,
    FAILED:           4,
    CANCELLED:        5,
    PAUSED:           6
}

function S3FileManager(){

    this.files = [];
    this.current_file = null;
    this.total_size = 0;
    this.cancelled = false;
    this.percent = 0;
    this.queue_size = 0;

    var self = this;
    this.next_id = function(){
        return self.files.length;
    }

    this.request_chunk_upload = function(){
        if (self.queue_size >= S3FileManager.config.MAX_PARALLEL_UPLOAD_CHUNKS) return 0;

        self.queue_size ++;
        return 1;
    }

    this.free_up_queue = function(){
        if (self.queue_size > 0) self.queue_size --;
    }

    this.add_file = function(file){
        var file = new S3File(file, self);
        file.id = self.next_id();
        file.chunk();
        file.on_file_upload_progress_change = self.handle_file_upload_progress_change;
        self.files.push(file);
        self.total_size += file.size;
    }

    this.start_upload = function(){
        $('#upload-progress').removeClass('hidden');
        self.process_upload();
    }

    this.process_upload = function(){
        if (self.cancelled) return;

        // check if we have free spaces to upload more chunks
        if (this.queue_size >= S3FileManager.config.MAX_PARALLEL_UPLOAD_CHUNKS) return;

        var all_processed = true;
        for (var i = 0; i < self.files.length; i++){
            var file = self.files[i];

            if (file.start_upload() === true){
                self.current_file = file;
                return;
            }

            if (!file.is_processed()) all_processed = false;
        }


        if (all_processed){
            // all files have been uploaded, happy ending
            $('#upload-progress .progress-bar').css('width', '100%');
            $('#btn-pause-upload').addClass('hidden');
            $('#btn-cancel-upload').addClass('hidden');
        }
    }

    this.pause_upload = function(){
        self.queue_size = 0;
        for (var i in self.files){
            self.files[i].pause_upload();
        }
    }

    this.resume_upload = function(){
        self.process_upload();
    }

    this.cancel_upload = function(){
        self.cancelled = true;
        for (var i in self.files){
            self.files[i].cancel_upload();
        }
        self.files = [];
        self.total_size = 0;
        self.percent = 0;
        self.queue_size = 0;
    }

    this.render = function(table){
        table.html('');
        for (var i in self.files){
            table.append(self.files[i].render());
        } 
    }


    this.handle_file_upload_progress_change = function(){
        var uploaded_size = 0;

        for(var i in self.files){
            uploaded_size += self.files[i].uploaded_size;
        }

        // update progress bar
        var new_percent = parseInt((100 * uploaded_size) / self.total_size);

        if (new_percent == self.percent) return;
        self.percent = new_percent

        $('#upload-progress .progress-bar').css('width', self.percent + '%');
    }
}

// change the following settings with your server url
S3FileManager.prototype.config = {
    MAX_PARALLEL_UPLOAD_CHUNKS = 5,
    SIGN_UPLOAD_INIT_REQUEST_URL = 'url/to/sign_upload_init_request',
    SIGN_FILE_UPLOAD_REQUEST_URL = 'url/to/sign_file_upload_request',
    SIGN_UPLOAD_COMPLETE_REQUEST_URL = 'url/to/sign_upload_complete_request',
    SIGN_UPLOAD_ABORT_REQUEST_URL = 'url/to/sign_upload_abort_request',
}

var s3_manager = new S3FileManager();

$(function(){
    $('#btn-browse').change(function(){
        var selected_files = $('#btn-browse')[0].files;
        for (var i = 0; i < selected_files.length; i++){
            s3_manager.add_file(selected_files[i]);
        }

        if (s3_manager.files.length > 0){
            s3_manager.render($('#file-list'));
            $('#btn-upload').removeClass('hidden');
        }
        
    });

    $('#btn-upload').click(function(){
        $(this).addClass('hidden');
        $('#btn-pause-upload').removeClass('hidden');
        $('#btn-cancel-upload').removeClass('hidden');
        s3_manager.start_upload();
    });

    $('#btn-pause-upload').click(function(){
        if ($(this).hasClass('btn-warning')){
            $(this).removeClass('btn-warning');
            $(this).addClass('btn-success');
            $(this).html('Resume');
            s3_manager.pause_upload();
        }else{
            $(this).removeClass('btn-success');
            $(this).addClass('btn-warning');
            $(this).html('Pause');
            s3_manager.resume_upload();
        }
    });

    $('#btn-cancel-upload').click(function(){
        s3_manager.cancel_upload();
        $('#file-list').html('<tr><td colspan="3">The upload has been cancelled.</td></tr>');
        $('#upload-progress').addClass('hidden');
        $('#upload-progress .progress-bar').css('width', '0');
        $('#btn-pause-upload').addClass('hidden');
        $('#btn-cancel-upload').addClass('hidden');
    });

});